/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { AgentSkill } from '../../AgentSkill.js';
import { AgentUtils } from '../../AgentUtils.js';
import { OpenAIChatCompletion } from '../../net/client/openai/OpenAIChatCompletion.js';

export class OpenAiAnalyzePdfSkill extends AgentSkill
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

    this.tools = [{
      type: 'function',
      name: 'open_ai_analyze_pdf',
      description: 'Analyzes a PDF stored in TempFileManagerSkill and returns the result as text.',
      parameters: {
        type: 'object',
        properties: {
          tempFileName: {
            type: 'string',
            description: 'Name of the PDF file stored in TempFileManagerSkill.',
          },
          question: {
            type: 'string',
            description: 'Describe what your request is about this PDF. Example: "Summarize this PDF in 5 bullet points."',
          },
        },
        required: ['tempFileName', 'question'],
        additionalProperties: false,
      },
    }];
  }

  get developerPrompt()
  {
    return `
    `;
  }

  getHumanReadableToolAction(toolName, args = {})
  {
    const toolNameReadable = {
      open_ai_analyze_pdf: '🔍 analyzing PDF with OpenAI',
    }[toolName];

    if (toolNameReadable == null)
    {
      return super.getHumanReadableToolAction(toolName, args);
    }

    let toolArgsReadable = '';

    switch (toolName)
    {
      case 'open_ai_analyze_pdf':
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

  async open_ai_analyze_pdf(args, context = {})
  {
    const tempFileManager = this.agent.skills.get('TempFileManagerSkill');

    if (!tempFileManager)
    {
      throw new Error('TempFileManagerSkill is required to analyze PDFs.');
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

    const response = await this.openAIClient.generate({
      instructions: 'Analyze the provided PDF and answer the user request briefly, factually, and without making up details.',
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: args.question,
            },
            {
              type: 'file',
              file: {
                filename: args.tempFileName,
                file_data: `data:${file.mimeType};base64,${base64}`,
              },
            },
          ],
        },
      ],
    });

    const assistantText = typeof response?.assistant_text === 'string'
      ? response.assistant_text.trim()
      : '';

    if (assistantText)
    {
      response.text = assistantText;
      return response;
    }

    for (const item of response.output ?? [])
    {
      if (item.type !== 'message')
      {
        continue;
      }

      for (const content of item.content ?? [])
      {
        if (content.type === 'output_text' && content.text?.trim())
        {
          response.text = content.text.trim();
          return response;
        }
      }
    }

    const outputText = typeof response?.output_text === 'string'
      ? response.output_text.trim()
      : '';

    if (outputText)
    {
      response.text = outputText;
      return response;
    }

    return {
      ok: false,
      error: {
        type: 'empty_model_output',
        message: 'open_ai_analyze_pdf returned an empty output.',
      },
      model: response?.request?.model ?? null,
      endpoint: response?.endpointUrl ?? null,
      response,
    };
  }
}
