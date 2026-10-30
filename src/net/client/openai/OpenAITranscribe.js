/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { OpenAIClient } from './OpenAIClient.js';
import { AgentUtils } from '../../../AgentUtils.js';

export class OpenAITranscribe extends OpenAIClient
{
  constructor({ apiKey, model = 'gpt-4o-mini', url = 'https://api.openai.com/' } = {})
  {
    super({ apiKey, url });
    this.model = model;
  }

  async transcribe({
    filename,
    mimeType,
    base64,
    language = null,
    prompt = null,
    model = undefined,
    signal = undefined,
  })
  {
    const formData = new FormData();
    const buffer = Buffer.from(base64, 'base64');
    const blob = new Blob([buffer], { type: mimeType || 'application/octet-stream' });

    const ext = AgentUtils.getExtensionFromMimeType(mimeType, 'file');
    filename = AgentUtils.ensureExtension(filename || 'audio', ext);

    formData.append('file', blob, filename);
    formData.append('model', model ?? this.model);
    formData.append('response_format', 'json');

    if (language != null)
    {
      formData.append('language', language);
    }

    if (prompt != null)
    {
      formData.append('prompt', prompt);
    }

    const { endpointUrl, payload } = await this.postForm('audio/transcriptions', formData, {
      errorContext: 'OpenAI audio transcription request failed',
      signal,
    });

    if (!payload || typeof payload !== 'object')
    {
      throw new Error(`Invalid transcription response: ${String(payload)}`);
    }

    return this.applyCost({
      endpointUrl,
      payload,
    }, payload);
  }
}
