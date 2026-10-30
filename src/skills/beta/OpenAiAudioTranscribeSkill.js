/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { AgentSkill } from '../../AgentSkill.js';
import { AgentUtils } from '../../AgentUtils.js';
import { OpenAITranscribe } from '../../net/client/openai/OpenAITranscribe.js';

export class OpenAiAudioTranscribeSkill extends AgentSkill
{
  constructor({ url, apiKey, model })
  {
    super();
    this.openAIClient = new OpenAITranscribe({
      url,
      apiKey,
      model,
    });

    this.description = "Provides functions to transcribe audio files stored in TempFileManagerSkill.";

    this.tools = [{
      type: 'function',
      name: 'open_ai_transcribe_audio',
      description: 'Transcribes an audio file or voice message stored in TempFileManagerSkill and returns the transcription as text.',
      parameters: {
        type: 'object',
        properties: {
          tempFileName: {
            type: 'string',
            description: 'Name of the audio file stored in TempFileManagerSkill.',
          },
          language: {
            anyOf: [
              { type: 'string' },
              { type: 'null' },
            ],
            description: 'Optional language code for transcription, for example "fr" or "en". Use null when unknown.',
          },
        },
        required: ['tempFileName', 'language'],
        additionalProperties: false,
      },
    }];
  }

  get usage()
  {
    return `
Rules:
- Use open_ai_transcribe_audio when the user asks to transcribe, understand, summarize, or extract speech from an audio file.
- The input file must already exist in TempFileManagerSkill.
- Use tempFileName exactly as provided by the input event or by temp_file_list.
- Use language when the user gave one or when it is clearly known, for example "fr" or "en".
- Use language null when the language is unknown.
- Do not use this tool for non-audio files.
- After transcription, use the returned text as the source of truth. Do not invent missing audio content.
`;
  }

  getHumanReadableToolAction(toolName, args = {})
  {
    const toolNameReadable = {
      open_ai_transcribe_audio: '🎙️ transcribing audio with OpenAI',
    }[toolName];

    if (toolNameReadable == null)
    {
      return super.getHumanReadableToolAction(toolName, args);
    }

    let toolArgsReadable = '';

    switch (toolName)
    {
      case 'open_ai_transcribe_audio':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.tempFileName, 64);
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

    return `${toolNameReadable} ${toolArgsReadable}`;
  }

  async open_ai_transcribe_audio(args, context = {})
  {
    const tempFileManager = this.agent.skills.get('TempFileManagerSkill');

    if (!tempFileManager)
    {
      throw new Error('TempFileManagerSkill is required to transcribe audio files.');
    }
    const file = await tempFileManager._getFile(args.tempFileName, context.streamId, true, context);
    const base64 = await tempFileManager.temp_file_read({
      tempFileName: args.tempFileName,
      encoding: 'base64',
      startLine: null,
      endLine: null,
      applyLimit: false,
      allowBinaryBase64: true,
    }, { ...context, streamId: context.streamId });

    const response = await this.openAIClient.transcribe({
      filename: args.tempFileName,
      mimeType: file.mimeType,
      base64,
      language: args.language,
    });

    response.text = response?.payload?.text?.trim?.() ?? '';
    return response;
  }
}
