/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { AgentSkill } from '../../AgentSkill.js';
import { AgentUtils } from '../../AgentUtils.js';
import { OpenAIChatCompletion } from '../../net/client/openai/OpenAIChatCompletion.js';

export class OpenAiImageVisionSkill extends AgentSkill
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

    this.description = 'Provides functions for image vision analysis and image understanding.';

    this.tools = [
      {
        type: 'function',
        name: 'open_ai_analyze_image',
        description: 'Analyzes an image stored in TempFileManagerSkill and returns the result as text.',
        parameters: {
          type: 'object',
          properties: {
            tempFileName: {
              type: 'string',
              description: 'Name of the image file stored in TempFileManagerSkill.',
            },
            question: {
              type: 'string',
              description: 'Question about the image.',
            },
          },
          required: ['tempFileName', 'question'],
          additionalProperties: false,
        },
      },
    ];
  }

  get usage()
  {
    return `
Rules:
- Use open_ai_analyze_image when the user asks to inspect, describe, understand, compare, or extract style information from an existing image.
- If the user wants to reuse the visual style of an image for generation or editing, first use open_ai_analyze_image to extract a clear style description.
- Never use this skill to generate or edit an image.
- Never invent image details that are not visible.
`;
  }

  getHumanReadableToolAction(toolName, args = {})
  {
    const toolNameReadable = {
      open_ai_analyze_image: '👁️ analyzing image with OpenAI',
    }[toolName];

    if (toolNameReadable == null)
    {
      return super.getHumanReadableToolAction(toolName, args);
    }

    let toolArgsReadable = '';

    switch (toolName)
    {
      case 'open_ai_analyze_image':
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

  get tempFileManagerSkill()
  {
    return this.agent.skills.get('TempFileManagerSkill');
  }

  async open_ai_analyze_image(args, context = {})
  {
    const tempFileManager = this.tempFileManagerSkill;
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
      instructions: 'Analyze the provided image and answer the user request briefly, factually, and without making up details. If the user asks for visual style extraction, describe colors, layout, typography, icons, shapes, lighting, composition, and reusable style rules.',
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: args.question,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${file.mimeType};base64,${base64}`,
                detail: 'auto',
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
        message: 'open_ai_analyze_image returned an empty output.',
      },
      model: response?.request?.model ?? null,
      endpoint: response?.endpointUrl ?? null,
      response,
    };
  }
}
