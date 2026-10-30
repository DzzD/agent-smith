/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { OpenAIClient } from './OpenAIClient.js';

export class OpenAIEmbedding extends OpenAIClient
{
  constructor({ apiKey, model = 'text-embedding-3-small', url = 'https://api.openai.com/' } = {})
  {
    super({ apiKey, url });
    this.model = model;
  }

  async createEmbeddings({ input, model = undefined, encoding_format = 'float', dimensions = undefined, user = undefined, signal = undefined } = {})
  {
    const request = {
      model: model ?? this.model,
      input,
      encoding_format,
    };

    if (dimensions != null)
    {
      request.dimensions = dimensions;
    }

    if (user != null)
    {
      request.user = user;
    }

    const { endpointUrl, payload } = await this.postJson('embeddings', request, {
      errorContext: 'OpenAI embedding request failed',
      signal,
    });

    if (!Array.isArray(payload?.data))
    {
      throw new Error('No embeddings returned by OpenAI');
    }

    return this.applyCost({
      endpointUrl,
      request,
      payload,
      embeddings: payload.data.map(item => item.embedding),
      model: payload.model ?? request.model,
      usage: payload.usage ?? null,
    }, payload);
  }
}
