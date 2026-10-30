/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { AgentSkill } from '../../AgentSkill.js';
import { OpenAIEmbedding } from '../../net/client/openai/OpenAIEmbedding.js';

export class OpenAiEmbeddingSkill extends AgentSkill
{
  constructor({ url, apiKey, model })
  {
    super();

    this.openAIClient = new OpenAIEmbedding({ url, apiKey, model });
    this.description = 'Creates vector embeddings from one or more text inputs using an OpenAI-compatible embedding model.';

    this.tools = [
      {
        type: 'function',
        name: 'open_ai_create_embeddings',
        description: 'Creates embeddings for one or more text inputs and returns one vector per input in the same order.',
        parameters: {
          type: 'object',
          properties: {
            input: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'string',
              },
              description: 'Texts to embed. The returned embeddings preserve this order.',
            },
            model: {
              type: ['string', 'null'],
              description: 'Optional embedding model override.',
            },
            dimensions: {
              type: ['integer', 'null'],
              minimum: 1,
              description: 'Optional output vector dimensions for models that support this parameter.',
            },
            encodingFormat: {
              type: ['string', 'null'],
              enum: ['float', 'base64', null],
              description: 'Optional embedding encoding format. Defaults to float.',
            },
            user: {
              type: ['string', 'null'],
              description: 'Optional provider user identifier.',
            },
          },
          required: ['input'],
          additionalProperties: false,
        },
      },
    ];
  }

  get usage()
  {
    return `
      - Use open_ai_create_embeddings to convert text into vectors for semantic search, similarity, clustering, or retrieval.
      - Send related texts in one input array to batch them in a single request.
      - The returned embeddings preserve the input order.
      - Use dimensions only when the configured model supports it.
      - Use encodingFormat float unless base64 is explicitly required.
    `;
  }

  getHumanReadableToolAction(toolName, args = {})
  {
    if (toolName !== 'open_ai_create_embeddings')
    {
      return super.getHumanReadableToolAction(toolName, args);
    }

    const inputCount = Array.isArray(args.input) ? args.input.length : 0;
    const readableCount = inputCount ? `${inputCount} text${inputCount === 1 ? '' : 's'}` : '';

    return readableCount ? `🧮 creating OpenAI embeddings for ${readableCount}` : '🧮 creating OpenAI embeddings';
  }

  async open_ai_create_embeddings(args)
  {
    const response = await this.openAIClient.createEmbeddings({
      input: args.input,
      model: args.model ?? undefined,
      dimensions: args.dimensions ?? undefined,
      encoding_format: args.encodingFormat ?? 'float',
      user: args.user ?? undefined,
    });

    return {
      success: true,
      model: response.model,
      embeddings: response.embeddings,
      usage: response.usage,
      ...(response.cost != null ? { cost: response.cost } : {}),
      response,
    };
  }
}
