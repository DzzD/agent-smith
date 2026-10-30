/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { OpenAIClient } from './OpenAIClient.js';

export class OpenAIResponse extends OpenAIClient
{
  constructor({ apiKey, url = 'https://api.openai.com/', request = {} } = {})
  {
    super({ apiKey, url });
    this.request = request;
  }

  static extractOutputText(payload)
  {
    if (typeof payload?.output_text === 'string')
    {
      return payload.output_text;
    }

    return (payload?.output ?? [])
      .flatMap((item) => item?.content ?? [])
      .filter((content) => content?.type === 'output_text' && typeof content.text === 'string')
      .map((content) => content.text)
      .join('\n');
  }

  async generate({ model, input, instructions = undefined, request = {}, signal = undefined } = {})
  {
    const body = {
      ...this.request,
      ...request,
      model,
      input,
    };

    if (instructions != null)
    {
      body.instructions = instructions;
    }

    const { endpointUrl, payload } = await this.postJson('responses', body, {
      errorContext: 'OpenAI response request failed',
      signal,
    });

    return this.applyCost({
      endpointUrl,
      request: body,
      payload,
      outputText: OpenAIResponse.extractOutputText(payload),
      usage: payload?.usage ?? null,
    }, payload);
  }
}