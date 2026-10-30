/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { AgentSkill } from './AgentSkill.js';
import { AgentUtils } from './AgentUtils.js';
import { DbQueryAgentEventSemanticSearch } from './app/db/queries/DbQueryAgentEventSemanticSearch.js';
import { OpenAIEmbedding } from './net/client/openai/OpenAIEmbedding.js';

export class AgentControlSkill extends AgentSkill
{
  constructor({ url, apiKey, model } = {})
  {
    super();

    this.embeddingModel = model;
    this.embeddingClient = url && apiKey && model ? new OpenAIEmbedding({ url, apiKey, model }) : null;

    this.tools = [
      {
        type: 'function',
        name: 'yield_until_next_event',
        description: `
Call this tool to stop the current task and wait for the next input event.
Do not call it while additional tool calls are still required to complete the current task.
Never call it immediately after sending a progress message or announcing an action that still needs to be performed.
When no useful action remains, call this tool instead of calling another tool or sending a useless, redundant, or repetitive message.
`        ,
        strict: true,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'search_stream_events',
        description: 'Semantically searches persisted events in the current stream. Use it to find earlier messages, tool calls, or results by meaning.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Semantic search query.' },
            limit: { type: ['integer', 'null'], description: 'Maximum results. Defaults to 10.', minimum: 1, maximum: 50 },
          },
          required: ['query', 'limit'],
          additionalProperties: false,
        },
      },
    ];
  }

  getHumanReadableToolAction(toolName, args = {})
  {
    const toolNameReadable = {
      yield_until_next_event: '',
      search_stream_events: '💭 remembering events',
    }[toolName];

    if (toolNameReadable == null)
    {
      return super.getHumanReadableToolAction(toolName, args);
    }

    let toolArgsReadable = '';

    switch (toolName)
    {
      case 'yield_until_next_event':
      {
        toolArgsReadable = '';
        break;
      }

      case 'search_stream_events':
      {
        toolArgsReadable = args.query;
        break;
      }

      default:
      {
        break;
      }
    }

    if (!toolArgsReadable)
    {
      return toolNameReadable;
    }

    return `${toolNameReadable} (${toolArgsReadable})`;
  }

  async yield_until_next_event(args, context)
  {
    const toolName = 'yield_until_next_event';
    return await this.agent.callControlTool(toolName, args, context);
  }

  async search_stream_events({ query, limit }, context)
  {
    if (!this.embeddingClient || !this.embeddingModel)
    {
      throw new Error('Event semantic search requires embedding configuration.');
    }

    const stream = await this.agent.eventManager.resolveStream(context.agentInput.source, context.streamId, { create: false });

    if (!stream)
    {
      return { events: [] };
    }

    const response = await this.embeddingClient.createEmbeddings({ input: [query], model: this.embeddingModel });
    const queryEmbedding = response.embeddings[0];

    if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0 || !queryEmbedding.every(Number.isFinite))
    {
      throw new Error('Embedding API returned an invalid query vector.');
    }

    const eventQuery = new DbQueryAgentEventSemanticSearch();
    const events = [];

    try
    {
      await eventQuery.search('', [JSON.stringify(queryEmbedding), stream.uuid, this.embeddingModel], {
        order: '"score" DESC',
        limit: limit ?? 10,
      });

      while (await eventQuery.next())
      {
        events.push({
          uuid: eventQuery.event.uuid,
          type: eventQuery.event.type,
          data: eventQuery.event.data,
          createdAt: eventQuery.event.createdAt,
          score: Number(eventQuery.getFieldValue('score')),
        });
      }
    }
    finally
    {
      eventQuery.close();
    }

    return { events };
  }
}
