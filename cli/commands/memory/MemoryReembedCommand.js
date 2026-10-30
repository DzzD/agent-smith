import { AgentMemory } from '../../../src/app/db/models/AgentMemory.js';
import { OpenAIEmbedding } from '../../../src/net/client/openai/OpenAIEmbedding.js';
import { parseOptions } from '../agent/AgentCommandUtils.js';

export class MemoryReembedCommand
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

    const memories = await this.loadMemories(sourceModel);

    if (memories.length === 0)
    {
      console.log(sourceModel === null ? 'No memory found.' : `No memory uses embedding model ${sourceModel}.`);
      return;
    }

    const embeddingClient = this.embeddingClientFactory({ apiKey, url, model: targetModel });
    let migratedCount = 0;

    const sourceDescription = sourceModel === null ? 'all embedding models' : sourceModel;
    console.log(`Migrating ${memories.length} memories from ${sourceDescription} to ${targetModel}.`);

    for (const sourceMemory of memories)
    {
      const response = await embeddingClient.createEmbeddings({ input: [sourceMemory.key, sourceMemory.value], model: targetModel });
      const [keyEmbedding, valueEmbedding] = response.embeddings;
      this.validateEmbeddings(keyEmbedding, valueEmbedding, sourceMemory.uuid);

      const memory = new AgentMemory();

      try
      {
        await memory.search('"uuid" = $1 AND "embedding_model" = $2 AND "key" = $3 AND "value" = $4', [
          sourceMemory.uuid,
          sourceMemory.embeddingModel,
          sourceMemory.key,
          sourceMemory.value,
        ], { limit: 1 });

        if (!(await memory.next()))
        {
          throw new Error(`Memory changed during migration: ${sourceMemory.uuid}`);
        }

        memory.keyEmbedding = JSON.stringify(keyEmbedding);
        memory.valueEmbedding = JSON.stringify(valueEmbedding);
        memory.embeddingModel = targetModel;
        await memory.save();
        migratedCount++;
        console.log(`Migrated memory ${migratedCount}/${memories.length}: ${sourceMemory.uuid}`);
      }
      finally
      {
        memory.close();
      }
    }

    console.log(`Migration complete: ${migratedCount} memories now use ${targetModel}.`);
  }

  async loadMemories(sourceModel)
  {
    const memory = new AgentMemory();
    const memories = [];

    try
    {
      const where = sourceModel === null ? '' : '"embedding_model" = $1';
      const params = sourceModel === null ? [] : [sourceModel];
      await memory.search(where, params, { order: '"uuid" ASC' });

      while (await memory.next())
      {
        memories.push({ uuid: memory.uuid, key: memory.key, value: memory.value, embeddingModel: memory.embeddingModel });
      }
    }
    finally
    {
      memory.close();
    }

    return memories;
  }

  validateEmbeddings(keyEmbedding, valueEmbedding, memoryUuid)
  {
    const embeddings = [keyEmbedding, valueEmbedding];

    if (!embeddings.every(embedding => Array.isArray(embedding) && embedding.length > 0 && embedding.every(Number.isFinite)))
    {
      throw new Error(`Embedding API returned invalid vectors for memory ${memoryUuid}.`);
    }

    if (keyEmbedding.length !== valueEmbedding.length)
    {
      throw new Error(`Embedding API returned inconsistent vector dimensions for memory ${memoryUuid}.`);
    }
  }
}
