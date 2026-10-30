/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { AgentSkill } from '../../AgentSkill.js';
import { AgentUtils } from '../../AgentUtils.js';

export class MistralOcrSkill extends AgentSkill
{
  constructor({ url, apiKey, model } = {})
  {
    super();

    this.url = url;
    this.apiKey = apiKey;
    this.model = model;

    this.description = 'Provides OCR and document text extraction from images and PDF documents using Mistral OCR.';

    this.tools = [
      {
        type: 'function',
        name: 'mistral_ocr',
        description: 'Extracts readable content from an image or PDF stored in TempFileManagerSkill.',
        parameters: {
          type: 'object',
          properties: {
            tempFileName: {
              type: 'string',
              description: 'Name of the image or PDF file stored in TempFileManagerSkill.',
            },
            includeBlocks: {
              type: 'boolean',
              description: 'Include structured document blocks with their type, content and bounding box.',
            },
            extractHeader: {
              type: 'boolean',
              description: 'Extract page headers separately when available.',
            },
            extractFooter: {
              type: 'boolean',
              description: 'Extract page footers separately when available.',
            },
            includeImages: {
              type: 'boolean',
              description: 'Extract embedded document images and save them as temporary files.',
            },
          },
          required: ['tempFileName'],
          additionalProperties: false,
        },
      },
    ];
  }

  get usage()
  {
    return `
Rules:
- Use mistral_ocr for plain document text extraction from images or PDF documents.
- Enable includeBlocks when layout, positions, block types, tables, titles, captions, equations, lists, or spatial information matters.
- Enable extractHeader or extractFooter only when those elements matter.
- Enable includeImages when embedded figures, diagrams, screenshots, photos, or illustrations are relevant.
- Extracted images are saved in TempFileManagerSkill and returned as tempFileName references.
- Extracted temporary images can be passed to an image vision skill for deeper analysis.
- Do not enable advanced options unnecessarily because they increase result size.
- Use an image vision skill for general visual understanding unrelated to document structure.
- Preserve the document structure as much as possible.
- Never invent text that is not present in the source document.
`.trim();
  }

  getHumanReadableToolAction(toolName, args = {})
  {
    const toolNameReadable = {
      mistral_ocr: '🔤 extracting document with Mistral OCR',
    }[toolName];

    if (toolNameReadable == null)
    {
      return super.getHumanReadableToolAction(toolName, args);
    }

    let toolArgsReadable = '';

    switch (toolName)
    {
      case 'mistral_ocr':
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

  logResponse(httpResponse, response)
  {
    const payload = JSON.parse(JSON.stringify(response, (key, value) =>
    {
      if (typeof value === 'string' && value.length > 4096)
      {
        return `[string omitted: ${value.length} characters]`;
      }

      return value;
    }));

    console.dir({
      method: 'POST',
      endpointUrl: new URL('/v1/ocr', this.url).toString(),
      status: httpResponse.status,
      statusText: httpResponse.statusText,
      headers: Object.fromEntries(httpResponse.headers.entries()),
      payload,
    }, { depth: null });
  }

  async mistral_ocr(args, context = {})
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

    if (!this.url)
    {
      throw new Error('SKILL_MISTRAL_OCR_URL is required.');
    }

    if (!this.apiKey)
    {
      throw new Error('SKILL_MISTRAL_OCR_KEY is required.');
    }

    const isImage = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.mimeType);
    const isPdf = file.mimeType === 'application/pdf';

    if (!isImage && !isPdf)
    {
      throw new Error(`Unsupported OCR mime type: ${file.mimeType}`);
    }

    const document = isPdf
      ? {
        type: 'document_url',
        document_url: `data:${file.mimeType};base64,${base64}`,
      }
      : {
        type: 'image_url',
        image_url: `data:${file.mimeType};base64,${base64}`,
      };

    const includeBlocks = args.includeBlocks ?? false;
    const extractHeader = args.extractHeader ?? false;
    const extractFooter = args.extractFooter ?? false;
    const includeImages = args.includeImages ?? false;

    const httpResponse = await fetch(new URL('/v1/ocr', this.url), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        document,
        include_blocks: includeBlocks,
        extract_header: extractHeader,
        extract_footer: extractFooter,
        include_image_base64: includeImages,
      }),
    });

    const response = await httpResponse.json();
    this.logResponse(httpResponse, response);

    if (!httpResponse.ok)
    {
      throw new Error(`Mistral OCR error ${httpResponse.status}: ${JSON.stringify(response)}`);
    }

    const responseCost = response?.cost
      ?? response?.response_cost
      ?? response?.cost_breakdown?.total_cost
      ?? response?.usage?.cost
      ?? response?.usage?.total_cost
      ?? httpResponse.headers.get('x-litellm-response-cost')
      ?? httpResponse.headers.get('llm_provider-x-litellm-response-cost')
      ?? httpResponse.headers.get('x-response-cost');
    const numericCost = Number(responseCost);
    const cost = responseCost != null && Number.isFinite(numericCost) && numericCost >= 0 ? numericCost : null;
    const pages = response.pages ?? [];
    const useStructuredMode = includeBlocks || extractHeader || extractFooter || includeImages;

    const text = pages
      .map((page) => page.markdown)
      .filter(Boolean)
      .join('\n\n');

    const hasBlocks = includeBlocks && pages.some((page) => Array.isArray(page.blocks) ? page.blocks.length > 0 : Boolean(page.blocks));
    const hasHeader = extractHeader && pages.some((page) => Boolean(page.header));
    const hasFooter = extractFooter && pages.some((page) => Boolean(page.footer));
    const hasImages = includeImages && pages.some((page) => Array.isArray(page.images) ? page.images.length > 0 : Boolean(page.images));
    const hasUsefulStructuredContent = hasBlocks || hasHeader || hasFooter || hasImages;

    if (!useStructuredMode)
    {
      if (text)
      {
        return {
          text,
          ...(cost != null ? { cost } : {}),
        };
      }

      return {
        ok: false,
        error: {
          type: 'empty_ocr_output',
          message: 'mistral_ocr returned an empty output.',
        },
        ...(cost != null ? { cost } : {}),
      };
    }

    if (text || hasUsefulStructuredContent)
    {
      const sourceFileName = String(args.tempFileName).split('/').pop();
      const sourceBaseName = AgentUtils.sanitizeFileName(sourceFileName.replace(/\.[^./\\]+$/, '') || 'document');
      const pageResults = [];

      for (const page of pages)
      {
        const pageResult = {
          index: page.index,
          markdown: page.markdown,
        };

        if (includeBlocks)
        {
          pageResult.blocks = page.blocks;
        }

        if (extractHeader)
        {
          pageResult.header = page.header;
        }

        if (extractFooter)
        {
          pageResult.footer = page.footer;
        }

        if (includeImages)
        {
          const pageImages = [];

          for (const [imageIndex, image] of (page.images ?? []).entries())
          {
            const match = image.image_base64.match(/^data:([^;]+);base64,(.+)$/);
            const mimeType = match[1];
            const base64Payload = match[2];
            const extension = AgentUtils.getExtensionFromMimeType(mimeType, 'image');
            const tempFileName = `${sourceBaseName}-page-${page.index}-image-${imageIndex + 1}.${extension}`;

            await tempFileManager.temp_file_remove({ tempFileName }, { ...context, streamId: context.streamId }).catch(() => {});
            await tempFileManager.temp_file_create({ tempFileName, mimeType }, { ...context, streamId: context.streamId });
            await tempFileManager.appendBuffer({
              tempFileName,
              data: AgentUtils.decodeBase64(base64Payload),
            }, { ...context, streamId: context.streamId });

            const imageResult = {
              ...image,
              tempFileName,
            };

            delete imageResult.image_base64;
            pageImages.push(imageResult);
          }

          pageResult.images = pageImages;
        }

        pageResults.push(pageResult);
      }

      return {
        text,
        pages: pageResults,
        ...(cost != null ? { cost } : {}),
      };
    }

    return {
      ok: false,
      error: {
        type: 'empty_ocr_output',
        message: 'mistral_ocr returned an empty output.',
      },
      ...(cost != null ? { cost } : {}),
    };
  }

}