/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { AgentSkill } from '../../AgentSkill.js';
import { AgentUtils } from '../../AgentUtils.js';
import { OpenAIAudioSpeech } from '../../net/client/openai/OpenAIAudioSpeech.js';

const OUTPUT_FORMATS = new Set(['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm']);

export class OpenAiAudioSpeechSkill extends AgentSkill
{
  constructor({ url, apiKey, model, voice })
  {
    super();

    this.audioSpeechClient = new OpenAIAudioSpeech({
      url,
      apiKey,
      model,
      voice,
    });

    this.description = 'Provides functions to synthesize speech audio files from text and store them in TempFileManagerSkill.';

    this.tools = [
      {
        type: 'function',
        name: 'open_ai_generate_speech',
        description: 'Generates speech audio from text and stores the audio file in TempFileManagerSkill.',
        parameters: {
          type: 'object',
          properties: {
            input: {
              type: 'string',
              description: 'Prepared spoken version of the final answer, written in the user language and optimized for natural pronunciation.',
            },
            outputTempFileName: {
              type: 'string',
              description: 'Output audio temp file name including extension.',
            },
            outputFormat: {
              type: 'string',
              enum: ['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'],
              description: 'Audio format to request from the provider.',
            },
            model: {
              anyOf: [
                { type: 'string' },
                { type: 'null' },
              ],
              description: 'Optional model override. Use null to keep default model.',
            },
            voice: {
              anyOf: [
                { type: 'string' },
                { type: 'null' },
              ],
              description: 'Optional voice override. Use null to keep default voice.',
            },
            speed: {
              anyOf: [
                { type: 'number' },
                { type: 'null' },
              ],
              description: 'Optional speech speed. Use null to keep default speed.',
            },
            instructions: {
              anyOf: [
                { type: 'string' },
                { type: 'null' },
              ],
              description: 'Optional style instructions for speech generation.',
            },
          },
          required: ['input', 'outputTempFileName', 'outputFormat'],
          additionalProperties: false,
        },
      },
    ];
  }

    get usage()
    {
            return `
        Rules:
        - Use open_ai_generate_speech when the user asks for spoken audio generated from text.
        - outputTempFileName must include the proper extension matching outputFormat.
        - outputFormat must be one of: mp3, opus, aac, flac, wav, pcm.
        - model, voice, speed and instructions are optional overrides.
        - The tool writes a binary audio file in TempFileManagerSkill and returns metadata.
        - Generate speech in the same language as the user's request unless the user explicitly asks for another language.
        - Do not send raw assistant output directly to speech synthesis.
        - Prepare a dedicated spoken version of the final answer before calling the tool.
        - Remove Markdown, HTML, code blocks, citations, URLs, file paths, and other content that should not be spoken literally.
        - Rewrite abbreviations, acronyms, symbols, numbers, units, and technical names when needed to improve pronunciation.
        - Correct spelling, grammar, punctuation, accents, and language-specific diacritics before speech synthesis.
        - Preserve the meaning of the final answer while making the spoken version natural, clear, and easy to understand.
        - Do not include internal reasoning, tool output, metadata, or implementation details in the spoken text.
        `;
    }
    
  get tempFileManagerSkill()
  {
    return this.agent.skills.get('TempFileManagerSkill');
  }

  getHumanReadableToolAction(toolName, args = {})
  {
    const toolNameReadable = {
      open_ai_generate_speech: '🔊 generating speech with OpenAI',
    }[toolName];

    if (toolNameReadable == null)
    {
      return super.getHumanReadableToolAction(toolName, args);
    }

    let toolArgsReadable = '';

    switch (toolName)
    {
      case 'open_ai_generate_speech':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.outputTempFileName, 64);
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

  _resolveMimeTypeFromOutputFormat(outputFormat)
  {
    if (outputFormat === 'mp3')
    {
      return 'audio/mpeg';
    }

    if (outputFormat === 'opus')
    {
      return 'audio/opus';
    }

    if (outputFormat === 'aac')
    {
      return 'audio/aac';
    }

    if (outputFormat === 'flac')
    {
      return 'audio/flac';
    }

    if (outputFormat === 'wav')
    {
      return 'audio/wav';
    }

    if (outputFormat === 'pcm')
    {
      return 'audio/pcm';
    }

    return 'application/octet-stream';
  }

  async open_ai_generate_speech(args, context = {})
  {
    const streamId = context.streamId;
    const outputFormat = AgentUtils.normalizeRequiredString(args.outputFormat, 'outputFormat').toLowerCase();

    if (!OUTPUT_FORMATS.has(outputFormat))
    {
      throw new Error(`Unsupported outputFormat: ${outputFormat}`);
    }

    const outputTempFileName = AgentUtils.normalizeRequiredString(args.outputTempFileName, 'outputTempFileName');
    const expectedOutputTempFileName = AgentUtils.ensureExtension(outputTempFileName, outputFormat);

    if (expectedOutputTempFileName !== outputTempFileName)
    {
      throw new Error(`outputTempFileName must end with .${outputFormat}`);
    }

    const input = AgentUtils.normalizeRequiredString(args.input, 'input');

    const response = await this.audioSpeechClient.generate({
      input,
      model: args.model ?? undefined,
      voice: args.voice ?? undefined,
      response_format: outputFormat,
      speed: args.speed ?? undefined,
      instructions: args.instructions ?? undefined,
    });

    const audioBuffer = response.audioBuffer;
    const outputMimeType = this._resolveMimeTypeFromOutputFormat(outputFormat);

    if ((await this.tempFileManagerSkill.getFiles(streamId, context)).has(outputTempFileName))
    {
      await this.tempFileManagerSkill.temp_file_remove({
        tempFileName: outputTempFileName,
      }, { ...context, streamId });
    }

    await this.tempFileManagerSkill.temp_file_create({
      tempFileName: outputTempFileName,
      mimeType: outputMimeType,
    }, { ...context, streamId });

    await this.tempFileManagerSkill.appendBuffer({
      tempFileName: outputTempFileName,
      data: audioBuffer,
    }, { ...context, streamId });

    return {
      success: true,
      endpoint: 'audioSpeech',
      inputLength: input.length,
      tempFileName: outputTempFileName,
      mimeType: outputMimeType,
      outputFormat,
      size: audioBuffer.length,
      request: response.request,
      endpointUrl: response.endpointUrl,
      response,
    };
  }
}
