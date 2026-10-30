/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { AgentSkill } from '../../AgentSkill.js';
import { AgentUtils } from '../../AgentUtils.js';
import { OpenAIImageGenerate } from '../../net/client/openai/OpenAIImageGenerate.js';
import { OpenAIImageEdit } from '../../net/client/openai/OpenAIImageEdit.js';

export class OpenAiImageSkill extends AgentSkill
{
  constructor({ url, apiKey, model })
  {
    super();

    this.imageGenerateClient = new OpenAIImageGenerate({
      url,
      apiKey,
      model,
    });

    this.imageEditClient = new OpenAIImageEdit({
      url,
      apiKey,
      model,
    });

    this.description = 'Provides functions for image creation and image editing. Each tool creates an image file in TempFileManagerSkill and returns its tempFileName.';

    this.tools = [
      {
        type: 'function',
        name: 'open_ai_create_image',
        description: 'Create a new image and stores it in TempFileManagerSkill.',
        parameters: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'Image creation prompt.',
            },
            outputTempFileName: {
              type: 'string',
              description: 'Output file name in TempFileManagerSkill.',
            },
            outputMimeType: {
              type: 'string',
              enum: ['image/png', 'image/jpeg', 'image/webp'],
              description: 'Output image mime type.',
            },
            size: {
              type: 'string',
              description: 'Image size. Example: 1024x1024.',
            },
          },
          required: ['prompt', 'outputTempFileName', 'outputMimeType', 'size'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'open_ai_edit_image',
        description: 'Edits one or more existing images stored in TempFileManagerSkill and stores the result in TempFileManagerSkill. Additional images can be used as references or as parts to reuse in the final image.',
        parameters: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'Image editing prompt. Must explain what to edit and how to use each input image.',
            },
            inputImages: {
              type: 'array',
              description: 'Input images stored in TempFileManagerSkill. First source image is usually the main image to edit. Other images can be references or parts to reuse.',
              minItems: 1,
              maxItems: 16,
              items: {
                type: 'object',
                properties: {
                  tempFileName: {
                    type: 'string',
                    description: 'Image file stored in TempFileManagerSkill.',
                  },
                  role: {
                    type: 'string',
                    enum: ['source', 'style_reference', 'content_reference', 'part_reference'],
                    description: 'How this image should be used: source to edit, style reference, content reference, or part/object reference to reuse.',
                  },
                  description: {
                    type: 'string',
                    description: 'Short description of how this image should influence the edit.',
                  },
                },
                required: ['tempFileName', 'role', 'description'],
                additionalProperties: false,
              },
            },
            maskTempFileName: {
              type: ['string', 'null'],
              description: 'Optional mask image stored in TempFileManagerSkill. Transparent mask areas indicate where the source image may be edited.',
            },
            outputTempFileName: {
              type: 'string',
              description: 'Output file name in TempFileManagerSkill.',
            },
            outputMimeType: {
              type: 'string',
              enum: ['image/png', 'image/jpeg', 'image/webp'],
              description: 'Output image mime type.',
            },
            size: {
              type: ['string', 'null'],
              description: 'Optional output image size. Do not provide it unless the user explicitly asks for a specific size.',
            },
          },
          required: ['prompt', 'inputImages', 'outputTempFileName', 'outputMimeType'],
          additionalProperties: false,
        },
      },
    ];
  }

  get usage()
  {
    return `
      OpenAiImageSkill creates a new image files in TempFileManagerSkill.

      Rules:
      - A successful open_ai_create_image or open_ai_edit_image result means the image file was created in TempFileManagerSkill.
      - The returned tempFileName is the created image filename.
      - Use the returned tempFileName to send or reuse the image.
      - Do not create an equivalent image if a successful image result already exists.
      - When a user asks to create, edit, or modify an image, send back the resulting image using the current-channel file tool.
      - Use open_ai_create_image when the user asks to create a new image.
      - Use open_ai_edit_image when the user asks to modify one or more existing images or to create an image using a reference style image.
      - For open_ai_edit_image, use role "source" for the image to modify.
      - For open_ai_edit_image, use role "style_reference" when an image should only provide visual style, colors, lighting, texture, mood, or composition inspiration.
      - For open_ai_edit_image, use role "content_reference" when an image provides subject, layout, composition, scene, pose, or structure.
      - For open_ai_edit_image, use role "part_reference" when an image contains an object, element, texture, logo, character, or part that should be reused in the final image.
      - For open_ai_edit_image, use maskTempFileName when the edit must be restricted to transparent areas of a mask image.
      - Do not copy unrelated subjects from reference images unless the user explicitly asks for it.
      - For open_ai_edit_image, do not provide size unless the user explicitly asks for a specific output size.
      - Never invent an output file name if the tool returns one.
      - Never use this skill to analyze an image in text.
  `;
  }

  getHumanReadableToolAction(toolName, args = {})
  {
    const toolNameReadable = {
      open_ai_create_image: '🎨 creating image with OpenAI',
      open_ai_edit_image: '🖌️ editing image with OpenAI',
    }[toolName];

    if (toolNameReadable == null)
    {
      return super.getHumanReadableToolAction(toolName, args);
    }

    let toolArgsReadable = '';

    switch (toolName)
    {
      case 'open_ai_create_image':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.outputTempFileName, 64);
        break;
      }

      case 'open_ai_edit_image':
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

  get tempFileManagerSkill()
  {
    return this.agent.skills.get('TempFileManagerSkill');
  }

  async open_ai_create_image(args, context = {})
  {
    const tempFileManager = this.tempFileManagerSkill;

    const outputFormat =
      args.outputMimeType === 'image/png' ? 'png' :
      args.outputMimeType === 'image/jpeg' ? 'jpeg' :
      args.outputMimeType === 'image/webp' ? 'webp' :
      'png';

    if (!this.imageGenerateClient?.generateImage)
    {
      throw new Error('OpenAiImageSkill is missing imageGenerateClient.generateImage');
    }

    const response = await this.imageGenerateClient.generateImage({
      prompt: args.prompt,
      size: args.size?.trim() || null,
      output_format: outputFormat,
    });
    const buffer = response.imageBuffer;

    if ((await tempFileManager.getFiles(context.streamId, context)).has(args.outputTempFileName))
    {
      await tempFileManager.temp_file_remove({
        tempFileName: args.outputTempFileName,
      }, { ...context, streamId: context.streamId });
    }

    await tempFileManager.temp_file_create({
      tempFileName: args.outputTempFileName,
      mimeType: args.outputMimeType,
    }, { ...context, streamId: context.streamId });

    await tempFileManager.appendBuffer({
      tempFileName: args.outputTempFileName,
      data: buffer,
    }, { ...context, streamId: context.streamId });

    return {
      success: true,
      created: true,
      tempFileName: args.outputTempFileName,
      mimeType: args.outputMimeType,
      size: buffer.length,
      mode: 'generation',
      response,
    };
  }

  async open_ai_edit_image(args, context = {})
  {
    const tempFileManager = this.tempFileManagerSkill;

    const outputFormat =
      args.outputMimeType === 'image/png' ? 'png' :
      args.outputMimeType === 'image/jpeg' ? 'jpeg' :
      args.outputMimeType === 'image/webp' ? 'webp' :
      'png';

    const inputImages = [];

    for (const inputImage of args.inputImages)
    {
      const file = await tempFileManager._getFile(inputImage.tempFileName, context.streamId, true, context);

      const base64 = await tempFileManager.temp_file_read({
        tempFileName: inputImage.tempFileName,
        encoding: 'base64',
        startLine: null,
        endLine: null,
        applyLimit: false,
        allowBinaryBase64: true,
      }, { ...context, streamId: context.streamId });

      inputImages.push({
        tempFileName: inputImage.tempFileName,
        role: inputImage.role,
        description: inputImage.description,
        imageBase64: base64,
        imageMimeType: file.mimeType,
      });
    }

    const referenceInstructions = inputImages
      .map((image, index) =>
      {
        return [
          'Image ' + (index + 1) + ':',
          '- tempFileName: ' + image.tempFileName,
          '- role: ' + image.role,
          '- description: ' + image.description,
        ].join('\n');
      })
      .join('\n\n');

    const prompt = [
      args.prompt,
      '',
      'Input image usage:',
      referenceInstructions,
      '',
      'Rules:',
      '- Use images with role "source" as the main image(s) to edit.',
      '- Use images with role "style_reference" only as visual style references.',
      '- Style references may influence colors, lighting, material, texture, composition, rendering style, and mood.',
      '- Use images with role "content_reference" as references for subject, layout, composition, scene, pose, or structure.',
      '- Use images with role "part_reference" as sources for specific objects, elements, textures, logos, characters, or parts to reuse in the final image.',
      '- Do not copy unrelated subjects, faces, objects, text, logos, or background elements from reference images unless explicitly requested.',
    ].join('\n');

    const editArgs = {
      prompt,
      images: inputImages.map((image) =>
      {
        return {
          imageBase64: image.imageBase64,
          imageMimeType: image.imageMimeType,
        };
      }),
      output_format: outputFormat,
    };

    if (args.maskTempFileName)
    {
      const maskFile = await tempFileManager._getFile(args.maskTempFileName, context.streamId, true, context);
      editArgs.maskBase64 = await tempFileManager.temp_file_read({
        tempFileName: args.maskTempFileName,
        encoding: 'base64',
        startLine: null,
        endLine: null,
        applyLimit: false,
        allowBinaryBase64: true,
      }, { ...context, streamId: context.streamId });
      editArgs.maskMimeType = maskFile.mimeType;
    }

    if (args.size?.trim() )
    {
      editArgs.size = args.size;
    }

    if (!this.imageEditClient?.editImage)
    {
      throw new Error('OpenAiImageSkill is missing imageEditClient.editImage');
    }

    const response = await this.imageEditClient.editImage(editArgs);
    const buffer = response.imageBuffer;

    if ((await tempFileManager.getFiles(context.streamId, context)).has(args.outputTempFileName))
    {
      await tempFileManager.temp_file_remove({
        tempFileName: args.outputTempFileName,
      }, { ...context, streamId: context.streamId });
    }

    await tempFileManager.temp_file_create({
      tempFileName: args.outputTempFileName,
      mimeType: args.outputMimeType,
    }, { ...context, streamId: context.streamId });

    await tempFileManager.appendBuffer({
      tempFileName: args.outputTempFileName,
      data: buffer,
    }, { ...context, streamId: context.streamId });

    return {
      success: true,
      created: true,
      tempFileName: args.outputTempFileName,
      mimeType: args.outputMimeType,
      size: buffer.length,
      mode: 'edit',
      response,
      inputImages: inputImages.map((image) =>
      {
        return {
          tempFileName: image.tempFileName,
          role: image.role,
          description: image.description,
          mimeType: image.imageMimeType,
        };
      }),
    };
  }
}
