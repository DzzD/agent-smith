/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { AgentSkill } from '../../AgentSkill.js';
import { AgentUtils } from '../../AgentUtils.js';

export class StirlingPdfSkill extends AgentSkill
{
  constructor({
    stirlingPdfUrl,
  } = {})
  {
    super();

    if (!stirlingPdfUrl?.trim())
    {
      throw new Error('stirlingPdfUrl is required.');
    }

    this.stirlingPdfUrl = stirlingPdfUrl.replace(/\/+$/, '');
    this.id = 'pdf';
    this.description = 'PDF conversion and content extraction skill. Converts office documents such as DOCX, XLSX, PPTX, ODT, ODS and RTF to PDF. Converts PDF pages to PNG, JPEG, GIF or WebP images for screenshots and thumbnails. Extracts PDF content to TXT or RTF and converts PDF documents to Markdown for reading and analysis.';

    this.tools = [
      {
        type: 'function',
        name: 'convert_to_pdf',
        description:
          'Convert a single office file (DOCX, XLSX, PPTX, ODT, ODS, RTF, etc.) to PDF using LibreOffice. The input file must already exist in TempFileManager. Returns the generated PDF as a temp file.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            tempFileName: {
              type: 'string',
              description:
                'Name of the source file stored in TempFileManager (e.g. "report.docx").',
            },
            outputFileName: {
              type: ['string', 'null'],
              description:
                'Optional output PDF file name. If omitted, the source file name is used with a .pdf extension.',
            },
          },
          required: ['tempFileName'],
        },
      },
      {
        type: 'function',
        name: 'convert_pdf_to_image',
        description:
          'Convert PDF page(s) to image(s) — useful for screenshots or thumbnails. The input PDF must already exist in TempFileManager. Returns a single image temp file when singleOrMultiple is "single", or a ZIP temp file containing one image per page when singleOrMultiple is "multiple".',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            tempFileName: {
              type: 'string',
              description:
                'Name of the source PDF file stored in TempFileManager.',
            },
            pageNumbers: {
              type: 'string',
              description:
                'Page numbers to convert, e.g. "1,3,5-9" or "all".',
            },
            imageFormat: {
              type: 'string',
              description: 'Output image format.',
              enum: ['png', 'jpeg', 'jpg', 'gif', 'webp'],
            },
            singleOrMultiple: {
              type: 'string',
              description:
                '"single" produces one merged image of all pages; "multiple" produces one image per page and returns them in a ZIP archive.',
              enum: ['single', 'multiple'],
            },
            colorType: {
              type: 'string',
              description: 'Color mode of the output image.',
              enum: ['color', 'greyscale', 'blackwhite'],
            },
            dpi: {
              type: ['integer', 'null'],
              description: 'DPI of the output image. Default: 300.',
              minimum: 72,
              maximum: 1200,
            },
          },
          required: ['tempFileName', 'pageNumbers', 'imageFormat', 'singleOrMultiple', 'colorType'],
        },
      },
      {
        type: 'function',
        name: 'convert_pdf_to_text',
        description:
          'Convert a PDF to plain text (.txt) or RTF (.rtf). The input PDF must already exist in TempFileManager. Returns the generated text file as a temp file.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            tempFileName: {
              type: 'string',
              description:
                'Name of the source PDF file stored in TempFileManager.',
            },
            outputFormat: {
              type: 'string',
              description: 'Output text format.',
              enum: ['txt', 'rtf'],
            },
          },
          required: ['tempFileName', 'outputFormat'],
        },
      },
      {
        type: 'function',
        name: 'convert_pdf_to_markdown',
        description:
          'Convert a PDF to Markdown. The input PDF must already exist in TempFileManager. Returns the generated Markdown file as a temp file.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            tempFileName: {
              type: 'string',
              description:
                'Name of the source PDF file stored in TempFileManager.',
            },
          },
          required: ['tempFileName'],
        },
      },
    ];
  }

  get usage()
  {
    return `
PDF rules:
- When receiving a PDF file, do not trigger any operation on it unless the user explicitly asks for it.
- Use convert_to_pdf to convert office files (DOCX, XLSX, PPTX, ODT, ODS, RTF, etc.) to PDF.
- Use convert_pdf_to_image to take screenshots of PDF pages or convert them to images (single mode returns one image, multiple mode returns a ZIP archive of images).
- Use convert_pdf_to_text to extract text from a PDF (plain text or RTF).
- Use convert_pdf_to_markdown to convert a PDF to Markdown.
- All input files must already exist in TempFileManager.
- All output files are stored in TempFileManager and returned with their temp file name.
`.trim();
  }

  getHumanReadableToolAction(toolName, args = {})
  {
    const toolNameReadable = {
      convert_pdf_to_text: '🔄 converting PDF to text',
      convert_pdf_to_markdown: '🔄 converting PDF to markdown',
      convert_pdf_to_image: '🖼️ converting PDF to image',
      convert_to_pdf: '📄 converting document to PDF',
    }[toolName];

    if (toolNameReadable == null)
    {
      return super.getHumanReadableToolAction(toolName, args);
    }

    let toolArgsReadable = '';

    switch (toolName)
    {
      case 'convert_pdf_to_text':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.tempFileName, 64);
        break;
      }

      case 'convert_pdf_to_markdown':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.tempFileName, 64);
        break;
      }

      case 'convert_pdf_to_image':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.tempFileName, 64);
        break;
      }

      case 'convert_to_pdf':
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

  // ─── Helpers ───────────────────────────────────────────────

  get httpSkill()
  {
    const skill = this.agent?.skills?.get('HttpSkill');

    if (!skill)
    {
      throw new Error('HttpSkill is required to perform PDF operations.');
    }

    return skill;
  }

  #buildUrl(path)
  {
    return `${this.stirlingPdfUrl}${path}`;
  }

  #deriveOutputName(tempFileName, extension)
  {
    return tempFileName.replace(/\.[^.]+$/, '') + '.' + extension;
  }

  async #postMultipart({ path, files, formFields = [], outputFileName, outputMode = 'temp_file' }, context = {})
  {
    const response = await this.httpSkill.http_post({
      url: this.#buildUrl(path),
      bodyMode: 'multipart',
      files: files.map((f) => ({
        fieldName: f.fieldName,
        tempFileName: f.tempFileName,
        fileName: f.fileName ?? f.tempFileName,
      })),
      formFields,
      outputMode,
      outputFileName,
    }, context);

    if (!response || (response.status && response.status !== 200))
    {
      const detail = response?.statusText || 'unknown error';
      throw new Error(`PDF operation failed: ${response?.status ?? 'no response'} ${detail}`);
    }

    return response;
  }

  // ─── Tool implementations ──────────────────────────────────

  async convert_to_pdf({ tempFileName, outputFileName = null } = {}, context = {})
  {
    if (!tempFileName)
    {
      throw new Error('tempFileName is required.');
    }

    const derivedOutput =
      outputFileName?.trim() || this.#deriveOutputName(tempFileName, 'pdf');

    const response = await this.#postMultipart({
      path: '/api/v1/convert/file/pdf',
      files: [{ fieldName: 'fileInput', tempFileName }],
      outputFileName: derivedOutput,
    }, context);

    return {
      ok: true,
      status: response.status,
      outputFileName: response.outputFileName ?? derivedOutput,
      tempFileName: response.outputFileName ?? derivedOutput,
      mimeType: 'application/pdf',
      size: response.size ?? null,
      message: `File "${tempFileName}" has been converted to PDF.`,
    };
  }

  async convert_pdf_to_image({
    tempFileName,
    pageNumbers,
    imageFormat,
    singleOrMultiple,
    colorType,
    dpi = 300,
  } = {}, context = {})
  {
    if (!tempFileName)
    {
      throw new Error('tempFileName is required.');
    }

    const normalizedImageMime = imageFormat === 'jpg' ? 'jpeg' : imageFormat;
    const expectedMimeType = singleOrMultiple === 'multiple'
      ? 'application/zip'
      : `image/${normalizedImageMime}`;
    const expectedExtension = singleOrMultiple === 'multiple'
      ? 'zip'
      : (imageFormat === 'jpeg' ? 'jpg' : imageFormat);
    const derivedOutput = this.#deriveOutputName(tempFileName, expectedExtension);

    const response = await this.#postMultipart({
      path: '/api/v1/convert/pdf/img',
      files: [{ fieldName: 'fileInput', tempFileName }],
      formFields: [
        { name: 'pageNumbers', value: pageNumbers },
        { name: 'imageFormat', value: imageFormat },
        { name: 'singleOrMultiple', value: singleOrMultiple },
        { name: 'colorType', value: colorType },
        { name: 'dpi', value: String(dpi) },
      ],
      outputFileName: derivedOutput,
    }, context);

    const outputFileName = response.outputFileName ?? derivedOutput;
    const responseMimeType = String(response.mimeType ?? response.contentType ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    const isZipOutput = responseMimeType.includes('zip')
      || outputFileName.toLowerCase().endsWith('.zip');

    return {
      ok: true,
      status: response.status,
      outputFileName,
      tempFileName: outputFileName,
      mimeType: isZipOutput ? 'application/zip' : expectedMimeType,
      size: response.size ?? null,
      message: isZipOutput
        ? `PDF "${tempFileName}" pages (${pageNumbers}) converted to ${imageFormat} images in ZIP archive "${outputFileName}".`
        : `PDF "${tempFileName}" pages (${pageNumbers}) converted to ${imageFormat} image(s).`,
    };
  }

  async convert_pdf_to_text({ tempFileName, outputFormat } = {}, context = {})
  {
    if (!tempFileName)
    {
      throw new Error('tempFileName is required.');
    }

    if (!outputFormat)
    {
      throw new Error('outputFormat is required (txt or rtf).');
    }

    const derivedOutput = this.#deriveOutputName(tempFileName, outputFormat);

    const response = await this.#postMultipart({
      path: '/api/v1/convert/pdf/text',
      files: [{ fieldName: 'fileInput', tempFileName }],
      formFields: [
        { name: 'outputFormat', value: outputFormat },
      ],
      outputFileName: derivedOutput,
    }, context);

    return {
      ok: true,
      status: response.status,
      outputFileName: response.outputFileName ?? derivedOutput,
      tempFileName: response.outputFileName ?? derivedOutput,
      mimeType: outputFormat === 'rtf' ? 'application/rtf' : 'text/plain',
      size: response.size ?? null,
      message: `PDF "${tempFileName}" converted to ${outputFormat}.`,
    };
  }

  async convert_pdf_to_markdown({ tempFileName } = {}, context = {})
  {
    if (!tempFileName)
    {
      throw new Error('tempFileName is required.');
    }

    const derivedOutput = this.#deriveOutputName(tempFileName, 'md');

    const response = await this.#postMultipart({
      path: '/api/v1/convert/pdf/markdown',
      files: [{ fieldName: 'fileInput', tempFileName }],
      outputFileName: derivedOutput,
    }, context);

    return {
      ok: true,
      status: response.status,
      outputFileName: response.outputFileName ?? derivedOutput,
      tempFileName: response.outputFileName ?? derivedOutput,
      mimeType: 'text/markdown',
      size: response.size ?? null,
      message: `PDF "${tempFileName}" converted to Markdown.`,
    };
  }
}