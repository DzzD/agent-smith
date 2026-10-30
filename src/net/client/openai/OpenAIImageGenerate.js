/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { OpenAIClient } from './OpenAIClient.js';
import { getGptImage2Cost } from './OpenAIImageCost.js';

export class OpenAIImageGenerate extends OpenAIClient
{
  constructor({ apiKey, model = 'gpt-5.4-mini', url = 'https://api.openai.com/' } = {})
  {
    super({ apiKey, url });
    this.model = model;
  }

  async generateImage({
    prompt,
    size = '1024x1024',
    model = undefined,
    output_format = 'png',
    n = 1,
    output_compression = undefined,
    signal = undefined,
  } = {})
  {
    const body =
    {
      model: model ?? this.model,
      prompt: prompt != undefined ? prompt : '',
      size,
      output_format,
      n,
      output_compression,
    };

    const { endpointUrl, payload } = await this.postJson('images/generations', body, {
      errorContext: 'OpenAI image generation request failed',
      signal,
    });

    const b64 = payload?.data?.[0]?.b64_json;

    if (!b64)
    {
      throw new Error('No image returned by OpenAI');
    }

    return {
      endpointUrl,
      request: body,
      payload,
      imageBuffer: Buffer.from(b64, 'base64'),
      cost: getGptImage2Cost(payload.usage),
    };
  }
}
