/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { OfficeParser } from 'officeparser';
import { AgentSkill } from '../../AgentSkill.js';
import { AgentUtils } from '../../AgentUtils.js';

export class ReadOfficeSkill extends AgentSkill
{
  constructor()
  {
    super();

    this.description = 'Reads office files stored in TempFileManagerSkill and extracts text, markdown, html, or RAG chunks.';

    this.tools = [
      {
        type: 'function',
        name: 'read_office_file',
        description: 'Extracts content from an office file stored in TempFileManagerSkill.',
        parameters: {
          type: 'object',
          properties: {
            tempFileName: {
              type: 'string',
              description: 'Office file name stored in TempFileManagerSkill.',
            },
            outputFormat: {
              type: 'string',
              enum: ['text', 'md', 'html', 'chunks'],
              description: 'Output format. Use text by default.',
            },
            outputTempFileName: {
              type: ['string', 'null'],
              description: 'Optional output file name to store extracted content.',
            },
            maxChars: {
              type: ['number', 'null'],
              description: 'Maximum characters returned directly. Use null for default.',
            },
          },
          required: ['tempFileName', 'outputFormat', 'outputTempFileName'],
          additionalProperties: false,
        },
      },
    ];
  }

  get usage()
  {
    return `
Rules:
- Use read_office_file when the user asks to read, inspect, summarize, analyze, extract, or answer questions about an office file.
- Supported input files include DOCX, PPTX, XLSX, ODT, ODP, ODS, PDF, RTF, CSV, Markdown, and HTML.
- The input file must already exist in TempFileManagerSkill.
- Use outputFormat "text" by default.
- Use outputFormat "md" when document structure matters.
- Use outputFormat "html" only when formatting matters.
- Use outputFormat "chunks" when preparing content for RAG.
- A successful read_office_file result means the content was extracted.
- If outputTempFileName is provided, use the returned outputTempFileName to reuse the extracted content.
- Do not use this skill for images, audio, video, ZIP, or databases.
`;
  }

  getHumanReadableToolAction(toolName, args = {})
  {
    const toolNameReadable = {
      read_office_file: '📄 reading office document',
    }[toolName];

    if (toolNameReadable == null)
    {
      return super.getHumanReadableToolAction(toolName, args);
    }

    let toolArgsReadable = '';

    switch (toolName)
    {
      case 'read_office_file':
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

  getFileType(tempFileName, mimeType)
  {
    const lowerName = String(tempFileName || '').toLowerCase();
    const lowerMime = String(mimeType || '').toLowerCase();

    if (lowerName.endsWith('.docx')) return 'docx';
    if (lowerName.endsWith('.pptx')) return 'pptx';
    if (lowerName.endsWith('.xlsx')) return 'xlsx';
    if (lowerName.endsWith('.odt')) return 'odt';
    if (lowerName.endsWith('.odp')) return 'odp';
    if (lowerName.endsWith('.ods')) return 'ods';
    if (lowerName.endsWith('.pdf')) return 'pdf';
    if (lowerName.endsWith('.rtf')) return 'rtf';
    if (lowerName.endsWith('.csv')) return 'csv';
    if (lowerName.endsWith('.md')) return 'md';
    if (lowerName.endsWith('.html')) return 'html';
    if (lowerName.endsWith('.htm')) return 'html';

    if (lowerMime.includes('wordprocessingml')) return 'docx';
    if (lowerMime.includes('presentationml')) return 'pptx';
    if (lowerMime.includes('spreadsheetml')) return 'xlsx';
    if (lowerMime === 'application/pdf') return 'pdf';
    if (lowerMime === 'text/csv') return 'csv';
    if (lowerMime === 'text/markdown') return 'md';
    if (lowerMime === 'text/html') return 'html';

    return null;
  }

  async read_office_file(args, context = {})
  {
    const tempFileManager = this.tempFileManagerSkill;

    if (!tempFileManager)
    {
      throw new Error('ReadOfficeSkill requires TempFileManagerSkill');
    }

    const file = await tempFileManager._getFile(args.tempFileName, context.streamId, true, context);

    const fileType = this.getFileType(args.tempFileName, file.mimeType);

    if (!fileType)
    {
      throw new Error(`Unsupported office file type: ${args.tempFileName}`);
    }

    const base64 = await tempFileManager.temp_file_read({
      tempFileName: args.tempFileName,
      encoding: 'base64',
      startLine: null,
      endLine: null,
      applyLimit: false,
      allowBinaryBase64: true,
    }, { ...context, streamId: context.streamId });

    const buffer = Buffer.from(base64, 'base64');

    const ast = await OfficeParser.parseOffice(buffer, {
      fileType,
      ocr: false,
      extractAttachments: false,
      ignoreComments: false,
      ignoreHeadersAndFooters: false,
    });

    const conversion = await ast.to(args.outputFormat);
    const value = conversion.value;

    const content = typeof value === 'string'
      ? value
      : JSON.stringify(value, null, 2);

    let outputTempFileName = null;

    if (args.outputTempFileName?.trim())
    {
      outputTempFileName = args.outputTempFileName.trim();

      if ((await tempFileManager.getFiles(context.streamId, context)).has(outputTempFileName))
      {
        await tempFileManager.temp_file_remove({
          tempFileName: outputTempFileName,
        }, { ...context, streamId: context.streamId });
      }

      const outputMimeType =
        args.outputFormat === 'html' ? 'text/html' :
        args.outputFormat === 'md' ? 'text/markdown' :
        'text/plain';

      await tempFileManager.temp_file_create({
        tempFileName: outputTempFileName,
        mimeType: outputMimeType,
      }, { ...context, streamId: context.streamId });

      await tempFileManager.temp_file_insert({
        tempFileName: outputTempFileName,
        content,
        startLine: null,
      }, { ...context, streamId: context.streamId });
    }

    const maxChars = Number.isFinite(args.maxChars)
      ? Math.max(0, args.maxChars)
      : 1000000;

    return {
      tempFileName: args.tempFileName,
      mimeType: file.mimeType,
      fileType,
      outputFormat: args.outputFormat,
      outputTempFileName,
      chars: content.length,
      truncated: content.length > maxChars,
      content: content.slice(0, maxChars),
      warnings: ast.warnings ?? conversion.messages ?? [],
    };
  }
}