/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { AgentSkill } from '../../AgentSkill.js';
import { AgentUtils } from '../../AgentUtils.js';

/**
 * KrokiDiagramSkill
 *
 * Renders textual diagrams using a fixed Kroki endpoint
 * and writes the resulting image (SVG/PNG) to TempFileManagerSkill.
 */
export class KrokiDiagramSkill extends AgentSkill
{
  constructor({
    endpoint = 'https://kroki.io',
    maxSourceLength = 1024 * 1024,
    maxResponseLength = 10 * 1024 * 1024,
    userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  } = {})
  {
    super();

    this.endpoint = endpoint;
    this.maxSourceLength = maxSourceLength;
    this.maxResponseLength = maxResponseLength;
    this.userAgent = userAgent;
    this.description = "Provides functions to renders a diagram such as PlantUML, Mermaid, GraphViz, and stores the result SVG or PNG image in TempFileManagerSkill";

    this.tools = [
      {
        type: 'function',
        name: 'kroki_render_diagram',
        description: 'Renders a diagram using Kroki (POST) and stores the result in TempFileManagerSkill.',
        parameters: {
          type: 'object',
          properties: {
            diagramType: {
              type: 'string',
              description: 'Diagram type supported by Kroki, e.g. plantuml, mermaid, graphviz, bpmn, ditaa.',
            },
            outputFormat: {
              type: 'string',
              description: 'Output format, usually svg or png.',
            },
            source: {
              type: 'string',
              description: 'Diagram source code.',
            },
            outputTempFileName: {
              type: 'string',
              description: 'TempFileManagerSkill document name to create and write the rendered output into.',
            },
          },
          required: ['diagramType', 'outputFormat', 'source', 'outputTempFileName'],
          additionalProperties: false,
        },
      },
    ];

    console.log('[KrokiDiagramSkill.constructor] endpoint =', this.endpoint);
  }

  get usage()
  {
    return `
Output:
- The rendered file can be sent or processed using the appropriate messaging or file tool.

Rules:
- Use kroki_render_diagram when the user asks to create, render, convert, or visualize a diagram.
- Use SVG when the user wants editable/readable text output.
- Use PNG when the user wants an image preview or a directly viewable image.
- Never claim that a diagram was generated unless kroki_render_diagram succeeded.
- Never invent or guess the output file name if the tool returns one.
- For Mermaid state diagrams, the source should start with "stateDiagram-v2".
- Never create the output file before generation.
- The rendering tool creates and writes the output file itself.
- Do not call TempFileManagerSkill to pre-create the output file for kroki_render_diagram.
    `;
  }

  getHumanReadableToolAction(toolName, args = {})
  {
    const toolNameReadable = {
      kroki_render_diagram: '📊 rendering diagram with Kroki',
    }[toolName];

    if (toolNameReadable == null)
    {
      return super.getHumanReadableToolAction(toolName, args);
    }

    let toolArgsReadable = '';

    switch (toolName)
    {
      case 'kroki_render_diagram':
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

  _normalizeEndpoint()
  {
    return String(this.endpoint ?? '').trim().replace(/\/+$/, '');
  }

  _normalizeDiagramType(diagramType)
  {
    return String(diagramType ?? '').trim().toLowerCase();
  }

  _normalizeOutputFormat(outputFormat)
  {
    const fmt = String(outputFormat ?? '').trim().toLowerCase();
    return ['svg', 'png'].includes(fmt) ? fmt : 'svg';
  }

  _normalizeSource(source)
  {
    const text = typeof source === 'string' ? source : String(source ?? '');
    return text.slice(0, this.maxSourceLength);
  }

  _normalizeOutputTempFileName(outputTempFileName)
  {
    return String(outputTempFileName ?? '').trim();
  }

  _mimeTypeFor(format)
  {
    if (format === 'svg') return 'image/svg+xml';
    if (format === 'png') return 'image/png';
    return 'application/octet-stream';
  }

  async _render({ diagramType, outputFormat, source })
  {
    const base = this._normalizeEndpoint();
    const type = this._normalizeDiagramType(diagramType);
    const fmt = this._normalizeOutputFormat(outputFormat);
    const src = this._normalizeSource(source);

    const url = `${base}/${encodeURIComponent(type)}/${encodeURIComponent(fmt)}`;

    console.log('[KrokiDiagramSkill._render] url =', url);
    console.log('[KrokiDiagramSkill._render] request =', {
      method: 'POST',
      diagramType: type,
      outputFormat: fmt,
      sourceLength: src.length,
    });

    const response = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'User-Agent': this.userAgent,
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Content-Type': 'text/plain; charset=utf-8',
      },
      body: src,
    });

    if (!response.ok)
    {
      const contentType = response.headers.get('content-type') || '';
      const headersDump = [...response.headers.entries()]
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');
      const errorText = await response.text();

      throw new Error(
        `Kroki error\n` +
        `URL: ${url}\n` +
        `Status: ${response.status} ${response.statusText}\n` +
        `Content-Type: ${contentType}\n` +
        `Headers:\n${headersDump}\n` +
        `Body:\n${errorText}`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > this.maxResponseLength)
    {
      throw new Error(`Kroki response too large: ${buffer.length} > ${this.maxResponseLength}`);
    }

    return {
      url: response.url,
      status: response.status,
      contentType: response.headers.get('content-type') ?? this._mimeTypeFor(fmt),
      buffer,
    };
  }

  async kroki_render_diagram(args, context = {})
  {
    const diagramType = args.diagramType;
    const outputFormat = args.outputFormat;
    const source = args.source;
    const outputTempFileName = this._normalizeOutputTempFileName(args.outputTempFileName);

    const tempFileManager = this.agent.skills.get('TempFileManagerSkill');

    if (!tempFileManager)
    {
      throw new Error('TempFileManagerSkill is required to store Kroki outputs.');
    }

    const result = await this._render({
      diagramType,
      outputFormat,
      source,
    });

    const fmt = this._normalizeOutputFormat(outputFormat);
    const mimeType = this._mimeTypeFor(fmt);

    if ((await tempFileManager.getFiles(context.streamId, context)).has(outputTempFileName))
    {
      await tempFileManager.execute('temp_file_remove', {
        tempFileName: outputTempFileName,
      }, { ...context, streamId: context.streamId });
    }

    await tempFileManager.execute('temp_file_create', {
      tempFileName: outputTempFileName,
      mimeType,
    }, { ...context, streamId: context.streamId });

    if (fmt === 'svg')
    {
      await tempFileManager.temp_file_insert({
        tempFileName: outputTempFileName,
        content: result.buffer.toString('utf8'),
        startLine: null,
      }, { ...context, streamId: context.streamId });
    }
    else
    {
      await tempFileManager.appendBuffer({
        tempFileName: outputTempFileName,
        data: result.buffer,
      }, { ...context, streamId: context.streamId });
    }

    return {
      endpoint: this._normalizeEndpoint(),
      diagramType: this._normalizeDiagramType(diagramType),
      outputFormat: fmt,
      outputTempFileName,
      url: result.url,
      status: result.status,
      contentType: result.contentType,
      size: result.buffer.length,
    };
  }
}
