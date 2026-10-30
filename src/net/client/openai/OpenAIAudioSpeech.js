/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { OpenAIClient } from './OpenAIClient.js';

export class OpenAIAudioSpeech extends OpenAIClient
{
  constructor({ apiKey, model = 'gpt-4o-mini-tts', voice = 'alloy', url = 'https://api.openai.com/' } = {})
  {
    super({ apiKey, url });
    this.model = model;
    this.voice = voice;
  }

  async generate({
    input,
    model = undefined,
    voice = undefined,
    response_format = 'mp3',
    speed = undefined,
    instructions = undefined,
    signal = undefined,
  } = {})
  {
    const request = {
      model: model ?? this.model,
      input: input != null ? String(input) : '',
      voice: voice ?? this.voice,
      response_format,
    };

    if (speed != null)
    {
      request.speed = speed;
    }

    if (instructions != null)
    {
      request.instructions = instructions;
    }

    const response = await this.postBinary('audio/speech', request, {
      errorContext: 'OpenAI audio speech request failed',
      signal,
    });

    return this.applyCost({
      endpointUrl: response.endpointUrl,
      request,
      audioBuffer: response.buffer,
    }, response);
  }
}
