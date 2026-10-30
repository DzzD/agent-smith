/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { AgentSkill } from '../../AgentSkill.js';
import { AgentMemory } from '../../app/db/models/AgentMemory.js';
import { AgentMemoryFile } from '../../app/db/models/AgentMemoryFile.js';
import { DbQueryAgentMemories } from '../../app/db/queries/DbQueryAgentMemories.js';
import { DbQueryAgentMemoryFiles } from '../../app/db/queries/DbQueryAgentMemoryFiles.js';
import { OpenAIEmbedding } from '../../net/client/openai/OpenAIEmbedding.js';

export class MemorySkill extends AgentSkill
{
  constructor({ url, apiKey, model, minimumScore = 0.45 })
  {
    super();

    if (!model)
    {
      throw new Error('MemorySkill requires an embedding model.');
    }

    this.embeddingModel = model;
    this.minimumScore = minimumScore;
    this.openAIClient = new OpenAIEmbedding({ url, apiKey, model });
    this.transactionSequence = 0;
    this.description = 'Stores and retrieves durable semantic memories scoped to the current agent and conversation stream.';

    this.tools = [
      {
        type: 'function',
        name: 'memory_remember',
        description: 'Retrieves the best durable memory candidates from the current agent and stream using semantic similarity.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Semantic query describing the durable information to retrieve.',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              description: 'Maximum number of compatible memory candidates to return. Defaults to 10.',
            },
          },
          required: ['query'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'memory_memorize',
        description: 'Creates a durable memory for the current agent and stream and atomically replaces obsolete memories when requested.',
        parameters: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'Concise, self-contained retrieval description naming the subject and context.',
            },
            value: {
              type: 'string',
              description: 'Complete durable information that remains understandable without the original conversation. Never rely on a temporary file name; attach every related temporary file with tempFileNames.',
            },
            scope: {
              type: 'string',
              enum: ['global', 'stream'],
              description: 'Use global across this agent streams, or stream only for the current stream.',
            },
            replaceMemoryUids: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Memory UIDs from the current stream to replace atomically. Omit or use an empty array to create a distinct memory.',
            },
            tempFileNames: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Every temporary file related to or required by this memory. These files are copied into permanent memory storage because temporary file names may later become unavailable.',
            },
          },
          required: ['key', 'value', 'scope'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'memory_file_download',
        description: 'Downloads a file attached to an accessible memory into the current stream temporary files.',
        parameters: {
          type: 'object',
          properties: {
            memoryFileUid: {
              type: 'string',
              description: 'UUID of the memory file returned by memory_remember.',
            },
            tempFileName: {
              type: 'string',
              description: 'Optional destination temp file name. Defaults to memory/<memoryUid>/<memoryFileUid>/<originalName>.',
            },
          },
          required: ['memoryFileUid'],
          additionalProperties: false,
        },
      },
    ];
  }

  get usage()
  {
    return `
      Use memory_memorize autonomously when durable information would likely be useful in a future conversation,
      and whenever the user explicitly asks you to remember something.

      Before calling memory_memorize, always call memory_remember with a query representing the proposed memory.

      When an explicit memory retrieval request returns no result, retry memory_remember once or twice with broader semantic wording.
      Keep the subject and distinguishing terms in each reformulation. Do not retry indefinitely and do not treat an unrelated result as a match.

      Temporary files are not durable and may later become unavailable. Never memorize a temporary file name as if it were a durable reference.
      When a memory relates to, mentions, depends on, describes, or was produced from temporary files, you must attach every required file with tempFileNames.
      Store the durable information in value and attach the actual files; do not store only their names or paths.
      Attached files are copied into permanent memory storage and remain available independently of the temporary files.
      memory_remember returns attachment metadata; use memory_file_download with memoryFileUid to obtain a temporary copy.

      Compare the returned memories:
      - Do nothing when the information is already stored accurately.
      - Replace outdated or incorrect memories.
      - Merge complementary memories when keeping them separately would create redundancy.
      - Create a new memory when the information is genuinely distinct.

      When replacing or merging memories, pass every obsolete memory UID in replaceMemoryUids.

      Choose the memory scope deliberately:
      - Use "global" for durable personal preferences, general knowledge, reusable procedures,
        or information that should remain available across the agent's streams.
      - Use "stream" for project decisions, constraints, plans, or context that only makes sense within the current stream.

      Prefer several focused memories over one memory containing unrelated subjects.
      Each memory should represent one stable subject that can be searched, replaced, or merged independently.

      Do not combine personal preferences, watched items, future plans, platform availability,
      and unrelated contextual details into a single memory merely because they appeared in the same conversation.

      The key is a concise retrieval description. It must:
      - be self-contained;
      - explicitly name the subject and context;
      - avoid ambiguous pronouns or references such as "it", "this" or "the project";
      - contain terms likely to appear in a future search;
      - preferably include a natural question followed by useful retrieval terms.

      The value must contain the complete durable information and remain understandable without the original conversation.
      It must not depend on temporary file names. Any file required to use or understand the memory must be attached with tempFileNames.

      Do not memorize transient details, raw conversation excerpts, temporary task state,
      or information that is already obvious from the current source files.
    `;
  }

  getHumanReadableToolAction(toolName, args = {})
  {
    if (toolName === 'memory_remember')
    {
      return `remembering ${String(args.query).slice(0, 80)}`;
    }

    if (toolName === 'memory_memorize')
    {
      return `memorizing ${String(args.key).slice(0, 80)}`;
    }

    return super.getHumanReadableToolAction(toolName, args);
  }

  async memory_remember({ query, limit = 10 }, context = {})
  {
    if (!Number.isInteger(limit) || limit < 1)
    {
      throw new Error('limit must be an integer greater than or equal to 1.');
    }

    const stream = await this.agent.eventManager.resolveStream(context.agentInput.source, context.streamId, { create: false });

    if (!stream)
    {
      throw new Error('The current stream does not exist.');
    }

    const response = await this.openAIClient.createEmbeddings({
      input: [query],
      model: this.embeddingModel,
    });
    const queryEmbedding = response.embeddings[0];
    const memories = new DbQueryAgentMemories();
    const results = [];

    try
    {
      const searchParams = [JSON.stringify(queryEmbedding), this.agent.eventManager.agentUuid, stream.uuid, this.embeddingModel];
      await memories.search('"score" >= $5', [...searchParams, this.minimumScore], { order: '"score" DESC', limit });

      while (await memories.next())
      {
        const result = {
          memoryUid: memories.memory.uuid,
          scope: memories.memory.streamUuid === null ? 'global' : 'stream',
          key: memories.memory.key,
          value: memories.memory.value,
          embeddingModel: memories.memory.embeddingModel,
          keySimilarity: Number(memories.getFieldValue('key_similarity')),
          valueSimilarity: Number(memories.getFieldValue('value_similarity')),
          score: Number(memories.getFieldValue('score')),
          files: await this.#getMemoryFiles(memories.memory.uuid),
        };

        if (results.length > 0 && JSON.stringify([...results, result]).length > this.toolValueMaxChar)
        {
          break;
        }

        results.push(result);
      }
    }
    finally
    {
      memories.close();
    }

    return results;
  }

  async memory_memorize({ key, value, scope, replaceMemoryUids = [], tempFileNames = [] }, context = {})
  {
    if (!replaceMemoryUids.every((memoryUid) => typeof memoryUid === 'string') || new Set(replaceMemoryUids).size !== replaceMemoryUids.length)
    {
      throw new Error('replaceMemoryUids must contain distinct memory UID strings.');
    }

    if (!tempFileNames.every((tempFileName) => typeof tempFileName === 'string') || new Set(tempFileNames).size !== tempFileNames.length)
    {
      throw new Error('tempFileNames must contain distinct temp file name strings.');
    }

    const stream = await this.agent.eventManager.resolveStream(context.agentInput.source, context.streamId, { create: false });

    if (!stream)
    {
      throw new Error('The current stream does not exist.');
    }

    const response = await this.openAIClient.createEmbeddings({
      input: [key, value],
      model: this.embeddingModel,
    });
    const [keyEmbedding, valueEmbedding] = response.embeddings;
    const connectionUid = `memory-${process.pid}-${++this.transactionSequence}`;
    const memory = new AgentMemory(connectionUid);
    memory.agentUuid = this.agent.eventManager.agentUuid;
    memory.streamUuid = scope === 'global' ? null : stream.uuid;
    memory.key = key;
    memory.value = value;
    memory.keyEmbedding = JSON.stringify(keyEmbedding);
    memory.valueEmbedding = JSON.stringify(valueEmbedding);
    memory.embeddingModel = this.embeddingModel;
    const tempFileManager = this.agent.skills.get('TempFileManagerSkill');
    const files = [];

    if (tempFileNames.length > 0 && !tempFileManager)
    {
      throw new Error('Memory file attachments require TempFileManagerSkill.');
    }

    for (const tempFileName of tempFileNames)
    {
      files.push(await tempFileManager._getFile(tempFileName, context.streamId, true, context));
    }

    await memory.saveReplacing(replaceMemoryUids, stream.uuid, files);

    return {
      memoryUid: memory.uuid,
      files: await this.#getMemoryFiles(memory.uuid),
    };
  }

  async memory_file_download({ memoryFileUid, tempFileName = null }, context = {})
  {
    const stream = await this.agent.eventManager.resolveStream(context.agentInput.source, context.streamId, { create: false });

    if (!stream)
    {
      throw new Error('The current stream does not exist.');
    }

    const memoryFile = new AgentMemoryFile();

    try
    {
      await memoryFile.search(`
        "uuid" = $1
        AND "memory_uuid" IN
        (
          SELECT "uuid"
          FROM "memory"
          WHERE "agent_uuid" = $2
            AND ("stream_uuid" IS NULL OR "stream_uuid" = $3)
        )
      `, [memoryFileUid, this.agent.eventManager.agentUuid, stream.uuid], { limit: 1 });

      if (!(await memoryFile.next()))
      {
        throw new Error(`Memory file not found or inaccessible: ${memoryFileUid}`);
      }

      const destination = tempFileName ?? `memory/${memoryFile.memoryUuid}/${memoryFile.uuid}/${memoryFile.name}`;
      const tempFileManager = this.agent.skills.get('TempFileManagerSkill');

      if (!tempFileManager)
      {
        throw new Error('memory_file_download requires TempFileManagerSkill.');
      }

      await tempFileManager.createFile({
        streamId: context.streamId,
        tempFileName: destination,
        mimeType: memoryFile.mimeType,
        description: memoryFile.description,
        owner: 'memory',
        permanent: false,
        data: memoryFile.data,
      }, context);

      return {
        success: true,
        message: `Memory file is available in ${destination}.`,
        memoryFileUid: memoryFile.uuid,
        tempFileName: destination,
        mimeType: memoryFile.mimeType,
        size: memoryFile.data.length,
      };
    }
    finally
    {
      memoryFile.close();
    }
  }

  async #getMemoryFiles(memoryUuid)
  {
    const query = new DbQueryAgentMemoryFiles();
    const files = [];

    try
    {
      await query.search('"memory_uuid" = $1', [memoryUuid], { order: '"memory_file"->>\'name\' ASC' });

      while (await query.next())
      {
        files.push({
          memoryFileUid: query.memoryFile.uuid,
          name: query.memoryFile.name,
          mimeType: query.memoryFile.mimeType,
          description: query.memoryFile.description,
          size: query.size,
        });
      }
    }
    finally
    {
      query.close();
    }

    return files;
  }
}
