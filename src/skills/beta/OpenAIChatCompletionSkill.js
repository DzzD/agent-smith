/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { AgentSkill } from '../../AgentSkill.js';
import { AgentUtils } from '../../AgentUtils.js';
import { OpenAIChatCompletion } from '../../net/client/openai/OpenAIChatCompletion.js';

export class OpenAiChatCompletionSkill extends AgentSkill
{
  constructor({ url, apiKey, model })
  {
    super();
    this.openAIClient = new OpenAIChatCompletion({
      url,
      apiKey,
      request: {
        model,
      },
    });

    this.description = 'Provides a simple text delegation function for long textual tasks using a chat completion model.';

    this.tools = [
      {
        type: 'function',
        name: 'open_ai_generate',
        description: 'Delegates a textual task (summary, extraction, search in long text) and returns a plain text result.',
        parameters: {
          type: 'object',
          properties: {
            task: {
              type: 'string',
              description: 'Textual task to execute, for example summarize, extract facts, or answer a question from provided text files.',
            },
            inputTempFileNames: {
              anyOf: [
                {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                },
                { type: 'null' },
              ],
              description: 'Optional list of text files from TempFileManagerSkill used as input context.',
            },
            instructions: {
              anyOf: [
                { type: 'string' },
                { type: 'null' },
              ],
              description: 'Optional additional execution instructions for this delegated text task.',
            },
            outputTempFileName: {
              anyOf: [
                { type: 'string' },
                { type: 'null' },
              ],
              description: 'Optional output text file name in TempFileManagerSkill.',
            },
          },
          required: ['task'],
          additionalProperties: false,
        },
      },
    ];
  }

  get usage()
  {
    return `
    Rules:
    - Use open_ai_generate for long textual processing to avoid saturating the main agent context.
    - Typical use cases: summarize long documents, extract structured facts, find specific information in large text files, or compare long textual sources.
    - inputTempFileNames must reference files that already exist in TempFileManagerSkill.
    - instructions is optional; when omitted, a default instruction is used.
    - outputTempFileName is optional; when provided, the generated text is also saved in TempFileManagerSkill.
    - The result must stay factual and based on provided input text.
`;
  }

  getHumanReadableToolAction(toolName, args = {})
  {
    const toolNameReadable = {
      open_ai_generate: '✨ generating response with OpenAI',
    }[toolName];

    if (toolNameReadable == null)
    {
      return super.getHumanReadableToolAction(toolName, args);
    }

    let toolArgsReadable = '';

    switch (toolName)
    {
      case 'open_ai_generate':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.task, 64);
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

  get tempFileManagerSkill()
  {
    return this.agent.skills.get('TempFileManagerSkill');
  }

  #extractResponseText(response)
  {
    const content = response?.assistant_text ?? response?.choices?.[0]?.message?.content ?? '';

    if (typeof content === 'string')
    {
      return content.trim();
    }

    if (Array.isArray(content))
    {
      return content
        .map((item) =>
        {
          if (typeof item === 'string')
          {
            return item;
          }

          return typeof item?.text === 'string' ? item.text : '';
        })
        .join('\n')
        .trim();
    }

    return '';
  }

  async open_ai_generate(args, context = {})
  {
    const tempFileManager = this.tempFileManagerSkill;
    const inputTempFileNames = Array.isArray(args.inputTempFileNames) ? args.inputTempFileNames : [];
    const documents = [];

    for (const tempFileName of inputTempFileNames)
    {
      const file = await tempFileManager._getFile(tempFileName, context.streamId, true, context);
      const content = await tempFileManager.temp_file_read({
        tempFileName,
        encoding: 'utf8',
        startLine: null,
        endLine: null,
        applyLimit: false,
      }, { ...context, streamId: context.streamId });

      documents.push([
        `File: ${tempFileName}`,
        `MimeType: ${file.mimeType}`,
        'Content:',
        content,
      ].join('\n'));
    }

    const promptSections = [
      `Task:\n${args.task}`,
    ];

    if (documents.length > 0)
    {
      promptSections.push(
        [
          'Input documents:',
          documents.join('\n\n-----\n\n'),
        ].join('\n')
      );
    }

    const instructions = typeof args.instructions === 'string' && args.instructions.trim()
      ? args.instructions
      : 'You are a delegated text-processing assistant. Answer briefly, factually, and only from the provided task and input documents. If information is missing, say it explicitly without guessing.';

    const response = await this.openAIClient.generate({
      instructions,
      input: promptSections.join('\n\n'),
    });

    const outputText = this.#extractResponseText(response);
    const outputTempFileName = typeof args.outputTempFileName === 'string' ? args.outputTempFileName.trim() : '';

    if (outputTempFileName)
    {
      if ((await tempFileManager.getFiles(context.streamId, context)).has(outputTempFileName))
      {
        await tempFileManager.temp_file_remove({
          tempFileName: outputTempFileName,
        }, { ...context, streamId: context.streamId });
      }

      await tempFileManager.temp_file_create({
        tempFileName: outputTempFileName,
        mimeType: 'text/plain',
      }, { ...context, streamId: context.streamId });

      await tempFileManager.appendBuffer({
        tempFileName: outputTempFileName,
        data: Buffer.from(outputText, 'utf8'),
      }, { ...context, streamId: context.streamId });

      return {
        success: true,
        outputTempFileName,
        mimeType: 'text/plain',
        size: Buffer.byteLength(outputText, 'utf8'),
        response,
      };
    }

    return { success: true, text: outputText, response };
  }
}
