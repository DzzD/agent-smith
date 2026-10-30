import { AgentUtils } from '../../../src/AgentUtils.js';
import { AgentEvent } from '../../../src/app/db/models/AgentEvent.js';
import { OpenAIEmbedding } from '../../../src/net/client/openai/OpenAIEmbedding.js';
import { parseOptions } from '../agent/AgentCommandUtils.js';

export class EventReembedCommand
{
  constructor({ env = process.env, embeddingClientFactory = options => new OpenAIEmbedding(options) } = {})
  {
    this.env = env;
    this.embeddingClientFactory = embeddingClientFactory;
  }

  async run(argv)
  {
    const options = parseOptions(argv);
    const sourceModel = options['from-model'] === undefined ? null : String(options['from-model']).trim();
    const maxRequestsPerMinute = options['max-rpm'] === undefined ? null : Number(options['max-rpm']);
    const batchSize = options.batch === undefined ? 1 : Number(options.batch);
    const apiKey = String(this.env.SKILL_EMBEDDING_OPENAI_KEY ?? '').trim();
    const url = String(this.env.SKILL_EMBEDDING_OPENAI_URL ?? '').trim();
    const targetModel = String(this.env.SKILL_EMBEDDING_OPENAI_MODEL ?? '').trim();

    if (!apiKey || !url || !targetModel)
    {
      throw new Error('Missing SKILL_EMBEDDING_OPENAI_KEY, SKILL_EMBEDDING_OPENAI_URL or SKILL_EMBEDDING_OPENAI_MODEL in examples/.env.');
    }

    if (sourceModel !== null && !sourceModel)
    {
      throw new Error('The source embedding model cannot be empty.');
    }

    if (sourceModel !== null && sourceModel === targetModel)
    {
      throw new Error(`Source and target embedding models are identical: ${targetModel}`);
    }

    if (maxRequestsPerMinute !== null && (!Number.isFinite(maxRequestsPerMinute) || maxRequestsPerMinute <= 0))
    {
      throw new Error('The maximum requests per minute must be a number greater than 0.');
    }

    if (!Number.isInteger(batchSize) || batchSize < 1)
    {
      throw new Error('The batch size must be an integer greater than or equal to 1.');
    }

    const events = await this.loadEvents(sourceModel);

    if (events.length === 0)
    {
      console.log(sourceModel === null ? 'No event found.' : `No event uses embedding model ${sourceModel}.`);
      return;
    }

    const embeddingClient = this.embeddingClientFactory({ apiKey, url, model: targetModel });
    const sourceDescription = sourceModel === null ? 'all embedding models, including missing embeddings' : sourceModel;
    const startedAt = Date.now();
    let migratedCount = 0;
    let requestCount = 0;
    let skippedCount = 0;

    const rateLimitDescription = maxRequestsPerMinute === null ? 'unlimited' : `${maxRequestsPerMinute} requests/min`;
    console.log(
      `Migrating ${events.length} events from ${sourceDescription} to ${targetModel} ` +
      `(batch size: ${batchSize}, rate limit: ${rateLimitDescription}).`
    );

    try
    {
      for (let batchStart = 0; batchStart < events.length; batchStart += batchSize)
      {
        const originalBatchSize = Math.min(batchSize, events.length - batchStart);
        const originalEvents = events.slice(batchStart, batchStart + batchSize);
        const pendingBatches = [{
          events: originalEvents,
          texts: originalEvents.map((sourceEvent) => `${sourceEvent.type}\n${AgentUtils.stringifyForPrompt(sourceEvent.data)}`),
        }];
        const embeddedEvents = [];

        while (pendingBatches.length > 0)
        {
          const currentBatch = pendingBatches.shift();

          if (maxRequestsPerMinute !== null && requestCount > 0)
          {
            const nextRequestAt = startedAt + requestCount * 60000 / maxRequestsPerMinute;
            const waitMs = Math.ceil(nextRequestAt - Date.now());

            if (waitMs > 0)
            {
              await new Promise((resolve) => setTimeout(resolve, waitMs));
            }
          }

          requestCount++;

          try
          {
            const response = await embeddingClient.createEmbeddings({ input: currentBatch.texts, model: targetModel });

            if (!Array.isArray(response.embeddings) || response.embeddings.length !== currentBatch.events.length)
            {
              throw new Error(
                `Embedding API returned ${response.embeddings?.length ?? 0} vectors for a batch of ${currentBatch.events.length} events.`
              );
            }

            for (let index = 0; index < currentBatch.events.length; index++)
            {
              embeddedEvents.push({ sourceEvent: currentBatch.events[index], embedding: response.embeddings[index] });
            }
          }
          catch (error)
          {
            const inputIndexMatch = String(error?.message ?? error).match(/Input id (\d+)/i);
            const inputIndex = inputIndexMatch ? Number(inputIndexMatch[1]) : -1;

            if (Number.isInteger(inputIndex) && inputIndex >= 0 && inputIndex < currentBatch.events.length)
            {
              const [skippedEvent] = currentBatch.events.splice(inputIndex, 1);
              currentBatch.texts.splice(inputIndex, 1);
              skippedCount++;
              console.warn(`Skipping event ${skippedEvent.uuid}: embedding request rejected this input (${error.message}).`);

              if (currentBatch.events.length > 0)
              {
                pendingBatches.unshift(currentBatch);
              }

              continue;
            }

            const contentTooLarge = error?.status === 413 || /413 Content Too Large|less than \d+ tokens/i.test(String(error?.message ?? error));

            if (!contentTooLarge)
            {
              throw error;
            }

            if (currentBatch.events.length === 1)
            {
              skippedCount++;
              console.warn(`Skipping event ${currentBatch.events[0].uuid}: embedding request rejected this input (${error.message}).`);
              continue;
            }

            const splitIndex = Math.ceil(currentBatch.events.length / 2);
            pendingBatches.unshift(
              { events: currentBatch.events.slice(splitIndex), texts: currentBatch.texts.slice(splitIndex) },
              { events: currentBatch.events.slice(0, splitIndex), texts: currentBatch.texts.slice(0, splitIndex) }
            );
          }
        }

        for (const { sourceEvent, embedding } of embeddedEvents)
        {
          this.validateEmbedding(embedding, sourceEvent.uuid);
          const event = new AgentEvent();

          try
          {
            const modelCondition = sourceEvent.embeddingModel === null ? '"embedding_model" IS NULL' : '"embedding_model" = $4';
            const params = [sourceEvent.uuid, sourceEvent.type, JSON.stringify(sourceEvent.data)];

            if (sourceEvent.embeddingModel !== null)
            {
              params.push(sourceEvent.embeddingModel);
            }

            await event.search(`"uuid" = $1 AND "type" = $2 AND "data" = $3::jsonb AND ${modelCondition}`, params, { limit: 1 });

            if (!(await event.next()))
            {
              throw new Error(`Event changed during migration: ${sourceEvent.uuid}`);
            }

            event.embedding = JSON.stringify(embedding);
            event.embeddingModel = targetModel;
            await event.save();
            migratedCount++;
          }
          finally
          {
            event.close();
          }
        }

        const elapsedMs = Date.now() - startedAt;
        const requestsPerMinute = elapsedMs > 0 ? requestCount * 60000 / elapsedMs : 0;
        console.log(
          `Migrated batch: events=${migratedCount}/${events.length}, batch=${embeddedEvents.length}/${originalBatchSize}, skipped=${skippedCount}, ` +
          `requests=${requestCount}, ` +
          `elapsed=${(elapsedMs / 1000).toFixed(1)}s, rate=${requestsPerMinute.toFixed(1)} requests/min`
        );
      }

      console.log(`Migration complete: ${migratedCount} events now use ${targetModel}.`);
    }
    finally
    {
      const totalElapsedMs = Date.now() - startedAt;
      const requestsPerMinute = totalElapsedMs > 0 ? requestCount * 60000 / totalElapsedMs : 0;
      console.log(
        `Embedding request summary: requests=${requestCount}, migrated=${migratedCount}, skipped=${skippedCount}, ` +
        `total time=${(totalElapsedMs / 1000).toFixed(1)}s, average=${requestsPerMinute.toFixed(1)} requests/min.`
      );
    }
  }

  async loadEvents(sourceModel)
  {
    const event = new AgentEvent();
    const events = [];

    try
    {
      const where = sourceModel === null ? '' : '"embedding_model" = $1';
      const params = sourceModel === null ? [] : [sourceModel];
      await event.search(where, params, { order: '"uuid" ASC' });

      while (await event.next())
      {
        events.push({ uuid: event.uuid, type: event.type, data: event.data, embeddingModel: event.embeddingModel });
      }
    }
    finally
    {
      event.close();
    }

    return events;
  }

  validateEmbedding(embedding, eventUuid)
  {
    if (!Array.isArray(embedding) || embedding.length === 0 || !embedding.every(Number.isFinite))
    {
      throw new Error(`Embedding API returned an invalid vector for event ${eventUuid}.`);
    }
  }
}
