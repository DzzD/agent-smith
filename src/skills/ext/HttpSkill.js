/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { AgentSkill } from '../../AgentSkill.js';
import { AgentUtils } from '../../AgentUtils.js';

export class HttpSkill extends AgentSkill
{
  constructor({
    maxBodyLength = 1024 * 1024,
    autoSizeOutputFile = 10 * 1024,
    userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    tempFileManagerSkill = null,
  } = {})
  {
    super();

    this.maxBodyLength = maxBodyLength;
    this.autoSizeOutputFile = autoSizeOutputFile;
    this.userAgent = userAgent;
    this._tempFileManagerSkill = tempFileManagerSkill;
    this.description = 'Provides functions to execute HTTP requests.';

    this.tools = [
      {
        type: 'function',
        name: 'http_get',
        description: 'Executes an HTTP GET request.',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'HTTP or HTTPS URL.',
            },
            headers: {
              anyOf: [
                {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: {
                        type: 'string',
                        description: 'Header name.',
                      },
                      value: {
                        type: 'string',
                        description: 'Header value.',
                      },
                    },
                    required: ['name', 'value'],
                    additionalProperties: false,
                  },
                },
                { type: 'null' },
              ],
              description: 'Optional HTTP headers.',
            },
            outputMode: {
              anyOf: [
                {
                  type: 'string',
                  enum: ['return', 'temp_file'],
                },
                { type: 'null' },
              ],
              description: 'Optional. If omitted, the skill chooses automatically: small text responses are returned inline, binary or large responses are written to a temp file.',
            },
            outputFileName: {
              anyOf: [
                { type: 'string' },
                { type: 'null' },
              ],
              description: 'Optional. Temporary output file name when outputMode is temp_file. If omitted and a temp file is needed, a file name is generated automatically.',
            },
          },
          required: ['url'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'http_post',
        description: 'Executes an HTTP POST request. Supports raw body or multipart form-data with temp files.',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'HTTP or HTTPS URL.',
            },
            headers: {
              anyOf: [
                {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: {
                        type: 'string',
                        description: 'Header name.',
                      },
                      value: {
                        type: 'string',
                        description: 'Header value.',
                      },
                    },
                    required: ['name', 'value'],
                    additionalProperties: false,
                  },
                },
                { type: 'null' },
              ],
              description: 'Optional HTTP headers.',
            },
            bodyMode: {
              anyOf: [
                {
                  type: 'string',
                  enum: ['raw', 'multipart'],
                },
                { type: 'null' },
              ],
              description: 'Optional. Use raw for a direct body, or multipart for form-data with fields and files. Defaults to raw.',
            },
            body: {
              anyOf: [
                { type: 'string' },
                { type: 'null' },
              ],
              description: 'Raw request body when bodyMode is raw. Use null otherwise.',
            },
            bodyEncoding: {
              anyOf: [
                {
                  type: 'string',
                  enum: ['utf8', 'base64'],
                },
                { type: 'null' },
              ],
              description: 'Encoding of the raw request body when bodyMode is raw. Defaults to utf8. Use utf8 for multipart.',
            },
            formFields: {
              anyOf: [
                {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: {
                        type: 'string',
                        description: 'Form field name.',
                      },
                      value: {
                        anyOf: [
                          { type: 'string' },
                          { type: 'number' },
                          { type: 'integer' },
                          { type: 'boolean' },
                          { type: 'null' },
                        ],
                        description: 'Form field value.',
                      },
                    },
                    required: ['name', 'value'],
                    additionalProperties: false,
                  },
                },
                { type: 'null' },
              ],
              description: 'Multipart text fields when bodyMode is multipart. Must be an array or null, not a JSON string.',
            },
            files: {
              anyOf: [
                {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      fieldName: {
                        anyOf: [
                          { type: 'string' },
                          { type: 'null' },
                        ],
                        description: 'Multipart field name for the uploaded file. Use null to default to "fileInput".',
                      },
                      tempFileName: {
                        anyOf: [
                          { type: 'string' },
                          { type: 'null' },
                        ],
                        description: 'Existing file in TempFileManagerSkill.',
                      },
                      fileName: {
                        anyOf: [
                          { type: 'string' },
                          { type: 'null' },
                        ],
                        description: 'Uploaded file name visible to the remote server. Use null to keep the temp file base name.',
                      },
                    },
                    required: ['fieldName', 'tempFileName', 'fileName'],
                    additionalProperties: false,
                  },
                },
                { type: 'null' },
              ],
              description: 'Multipart uploaded files when bodyMode is multipart. Must be an array or null, not a JSON string.',
            },
            outputMode: {
              anyOf: [
                {
                  type: 'string',
                  enum: ['return', 'temp_file'],
                },
                { type: 'null' },
              ],
              description: 'Optional. If omitted, the skill chooses automatically: small text responses are returned inline, binary or large responses are written to a temp file.',
            },
            outputFileName: {
              anyOf: [
                { type: 'string' },
                { type: 'null' },
              ],
              description: 'Optional. Temporary output file name when outputMode is temp_file. If omitted and a temp file is needed, a file name is generated automatically.',
            },
          },
          required: ['url'],
          additionalProperties: false,
        },
      },
    ];
  }

  get usage()
  {
    return `
  Output:
  - Use outputMode "return" for text only.
  - Use outputMode "temp_file" only for binary, file-like, or large content.
  - Never return PDFs, images, audio, video, archives, or raw binary/base64 in the conversation.

  Rules:
  - Always call HttpSkill with a valid absolute URL.
  - Never guess endpoint paths, parameters, field names, payloads, or fallback values.
  - Follow the exact endpoint/API description when available.
  - If required values are missing, do not make the request.
  - Do not retry unchanged when HttpSkill reports a blocked, challenge, captcha, or unusable page.

  Multipart:
  - For file upload, use http_post with bodyMode "multipart".
  - Uploaded files must come from TempFileManagerSkill.
  - Never read or convert files to base64 for upload.
  - headers, formFields, and files must be arrays or null, never strings.
  - files must use:
    {
      "fieldName": "<exact field name>",
      "tempFileName": "<exact temp file name>"
    }
  - formFields must use:
    {
      "name": "<exact field name>",
      "value": <exact value>
    }
  `.trim();
  }

  getHumanReadableToolAction(toolName, args = {})
  {
    const toolNameReadable = {
      http_get: '🌐 calling HTTP GET endpoint',
      http_post: '🌐 calling HTTP POST endpoint',
    }[toolName];

    if (toolNameReadable == null)
    {
      return super.getHumanReadableToolAction(toolName, args);
    }

    let toolArgsReadable = '';

    switch (toolName)
    {
      case 'http_get':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.url, 64);
        break;
      }

      case 'http_post':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.url, 64);
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
    return this._tempFileManagerSkill ?? this.agent.skills.get('TempFileManagerSkill');
  }

  _buildRequestHeaders(headersInput)
  {
    const parsed = AgentUtils.parseArrayInput(headersInput);
    const normalized = Array.isArray(parsed) ? parsed : null;

    const result = {
      'User-Agent': this.userAgent,
      'Accept': '*/*',
    };

    if (!normalized)
    {
      return result;
    }

    for (const header of normalized)
    {
      if (header?.name)
      {
        result[header.name] = header.value ?? '';
      }
    }

    return result;
  }

  _isUnusableHtmlResult(result)
  {
    if (!result?.ok)
    {
      return false;
    }

    const contentType = String(result.contentType || '').toLowerCase();

    if (!contentType.includes('html'))
    {
      return false;
    }

    const body = typeof result.body === 'string' ? result.body : '';

    if (!body)
    {
      return false;
    }

    const lower = body.toLowerCase();

    if (
      lower.includes('captcha')
      || lower.includes('challenge')
      || lower.includes('/tspd/')
      || lower.includes('cf-chl')
      || lower.includes('attention required')
      || lower.includes('access denied')
      || lower.includes('bot detection')
      || lower.includes('failureconfig')
    )
    {
      return true;
    }

    const hasHtml = lower.includes('<html');
    const scriptCount = (body.match(/<script/gi) || []).length;
    const readableTextLength = body
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .length;

    return hasHtml && scriptCount >= 3 && readableTextLength < 200;
  }

  _buildAutoOutputFileName(url, contentType)
  {
    let baseName = 'http_response';
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, '');
    const lastSegment = path.split('/').filter(Boolean).pop();

    if (lastSegment)
    {
      baseName = lastSegment;
    }

    const sanitizedBaseName = AgentUtils.sanitizeFileName(baseName);

    if (AgentUtils.hasFileExtension(sanitizedBaseName))
    {
      return sanitizedBaseName;
    }

    const extension = AgentUtils.getExtensionFromMimeType(contentType, 'file');

    return AgentUtils.ensureExtension(sanitizedBaseName, extension);
  }

  _shouldAutoWriteToFile(result)
  {
    if (!result.ok)
    {
      return false;
    }

    const isText = AgentUtils.isTextMimeType(result.contentType || '');

    if (!isText)
    {
      return true;
    }

    return typeof result.body === 'string' && result.body.length > this.autoSizeOutputFile;
  }

  async _buildMultipartFormData(formFieldsInput, fileEntriesInput, context = {})
  {
    const form = new FormData();

    const normalizedFormFields = AgentUtils.parseArrayInput(formFieldsInput);
    const normalizedFiles = AgentUtils.parseArrayInput(fileEntriesInput);

    if (Array.isArray(normalizedFormFields))
    {
      for (const field of normalizedFormFields)
      {
        form.append(field.name, field.value ?? '');
      }
    }

    if (Array.isArray(normalizedFiles))
    {
      for (const item of normalizedFiles)
      {
        const tempFileName =
          typeof item?.tempFileName === 'string' && item.tempFileName.trim()
            ? item.tempFileName.trim()
            : null;

        const file = await this.tempFileManagerSkill._getFile(tempFileName, context.streamId, true, context);

        const fileName =
          typeof item.fileName === 'string' && item.fileName.trim()
            ? item.fileName.trim()
            : tempFileName.split('/').pop();

        const fieldName =
          typeof item.fieldName === 'string' && item.fieldName.trim()
            ? item.fieldName.trim()
            : 'fileInput';

        form.append(
          fieldName,
          new File(
            [new Uint8Array(file.data)],
            fileName,
            { type: file.mimeType || 'application/octet-stream' },
          ),
        );
      }
    }

    return form;
  }

  async _fetch({ method, url, headers, body, bodyEncoding, bodyMode, formFields, files }, context = {})
  {
    const requestHeaders = this._buildRequestHeaders(headers);
    let requestBody = undefined;

    if (bodyMode === 'multipart')
    {
      requestBody = await this._buildMultipartFormData(formFields, files, context);
      delete requestHeaders['Content-Type'];
      delete requestHeaders['content-type'];
    }
    else
    {
      requestBody = body == null
        ? undefined
        : bodyEncoding === 'base64'
          ? Buffer.from(body, 'base64')
          : body;
    }

    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: requestBody,
      redirect: 'follow',
    });

    const contentType = response.headers.get('content-type') ?? '';
    const isText = AgentUtils.isTextMimeType(contentType);

    let responseBody;
    let responseEncoding;

    if (isText)
    {
      responseBody = await response.text();
      responseEncoding = 'utf8';
    }
    else
    {
      const buffer = Buffer.from(await response.arrayBuffer());
      responseBody = buffer.toString('base64');
      responseEncoding = 'base64';
    }

    const result = {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      finalUrl: response.url,
      contentType,
      encoding: responseEncoding,
      body: responseBody,
      headers: Object.fromEntries(response.headers.entries()),
    };

    if (this._isUnusableHtmlResult(result))
    {
      return {
        ok: false,
        status: response.status,
        statusText: response.statusText,
        finalUrl: response.url,
        contentType,
        encoding: 'utf8',
        headers: result.headers,
        error: {
          type: 'unusable_webpage',
          message: 'Fetched page is not directly usable content.',
        },
      };
    }

    return result;
  }

  _truncateForReturn(result)
  {
    if (typeof result.body !== 'string')
    {
      return result;
    }

    const truncatedBody = AgentUtils.truncate(result.body, this.maxBodyLength);

    if (truncatedBody === result.body)
    {
      return result;
    }

    return {
      ...result,
      body: truncatedBody,
      truncated: true,
      originalBodyLength: result.body.length,
      maxBodyLength: this.maxBodyLength,
    };
  }

  async _writeToTempFile(outputFileName, mimeType, encoding, content, context = {})
  {
    if ((await this.tempFileManagerSkill.getFiles(context.streamId, context)).has(outputFileName))
    {
      await this.tempFileManagerSkill.temp_file_remove({ tempFileName: outputFileName }, { ...context, streamId: context.streamId });
    }

    await this.tempFileManagerSkill.temp_file_create({
      tempFileName: outputFileName,
      mimeType,
    }, { ...context, streamId: context.streamId });

    if (encoding === 'utf8')
    {
      await this.tempFileManagerSkill.temp_file_insert({
        tempFileName: outputFileName,
        content,
        startLine: null,
      }, { ...context, streamId: context.streamId });
    }
    else
    {
      await this.tempFileManagerSkill.appendBuffer({
        tempFileName: outputFileName,
        data: Buffer.from(content, 'base64'),
      }, { ...context, streamId: context.streamId });
    }

    const file = await this.tempFileManagerSkill._getFile(outputFileName, context.streamId, false, context);

    return {
      outputFileName,
      mimeType: file.mimeType,
      size: file.data.length,
    };
  }

  async _handleResponse(result, outputMode, outputFileName, context = {})
  {
    const effectiveOutputMode = outputMode == null
      ? (this._shouldAutoWriteToFile(result) ? 'temp_file' : 'return')
      : outputMode;

    if (effectiveOutputMode === 'return' || !result.ok)
    {
      return this._truncateForReturn(result);
    }

    if (effectiveOutputMode !== 'temp_file')
    {
      throw new Error(`Unsupported outputMode: ${effectiveOutputMode}`);
    }

    const effectiveOutputFileName =
      typeof outputFileName === 'string' && outputFileName.trim()
        ? outputFileName.trim()
        : this._buildAutoOutputFileName(result.finalUrl, result.contentType);

    const saved = await this._writeToTempFile(
      effectiveOutputFileName,
      result.contentType || 'application/octet-stream',
      result.encoding,
      result.body,
      context,
    );

    return {
      ok: result.ok,
      status: result.status,
      statusText: result.statusText,
      finalUrl: result.finalUrl,
      contentType: result.contentType,
      encoding: result.encoding,
      autoOutputMode: outputMode == null,
      ...saved,
    };
  }

  async http_get(args, context = {})
  {
    const result = await this._fetch({
      method: 'GET',
      url: args.url,
      headers: args.headers,
      body: null,
      bodyEncoding: 'utf8',
      bodyMode: 'raw',
      formFields: null,
      files: null,
    }, context);

    return this._handleResponse(result, args.outputMode, args.outputFileName, context);
  }

  async http_post(args, context = {})
  {
    const result = await this._fetch({
      method: 'POST',
      url: args.url,
      headers: args.headers,
      body: args.body ?? null,
      bodyEncoding: args.bodyEncoding ?? 'utf8',
      bodyMode: args.bodyMode ?? 'raw',
      formFields: args.formFields ?? null,
      files: args.files ?? null,
    }, context);

    return this._handleResponse(result, args.outputMode, args.outputFileName, context);
  }
}
