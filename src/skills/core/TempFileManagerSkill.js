/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { Agent } from '../../Agent.js';
import { AgentSkill } from '../../AgentSkill.js';
import { AgentUtils } from '../../AgentUtils.js';
import { AgentAgent } from '../../app/db/models/AgentAgent.js';
import { AgentChannel } from '../../app/db/models/AgentChannel.js';
import { AgentStream } from '../../app/db/models/AgentStream.js';
import { AgentFile } from '../../app/db/models/AgentFile.js';
import { DbQueryAgentStream } from '../../app/db/queries/DbQueryAgentStream.js';
import { DbQueryAgentFiles } from '../../app/db/queries/DbQueryAgentFiles.js';
import { DbQueryAgentFileContent } from '../../app/db/queries/DbQueryAgentFileContent.js';

const tempFileNameDescription = 'File name with extension. Can include logical folders using "/", for example "reports/output.txt".';
const permanentFileErrorMessage = 'This file is permanent and cant be modifeid, make a copy usng temp_file_save_as if you want a modified version of this file';

export class TempFileManagerSkill extends AgentSkill
{
  constructor({ maxFileReadChars = 20000 } = {})
  {
    super();

    this.maxFileReadChars = maxFileReadChars;

    this.description = `Provides functions to create, read, modify, organize, list, search, and remove files using logical directory paths. Reads are limited to ${this.maxFileReadChars} characters per call. Large amounts of content can be processed across multiple tool calls.`;

    this.tools = [
      {
        type: 'function',
        name: 'temp_file_create',
        description: 'Creates an empty file with a MIME type. Optional initial text content is supported for text MIME types.',
        parameters: {
          type: 'object',
          properties: {
            tempFileName: {
              type: 'string',
              description: tempFileNameDescription,
            },
            mimeType: {
              type: 'string',
              description: 'File MIME type, for example text/plain or application/pdf.',
            },
            description: {
              type: 'string',
              description: 'Optional description displayed when listing files.',
            },
            owner: {
              type: 'string',
              description: 'User who owns or is associated with this file. Use the display name available in the conversation.',
            },
            content: {
              type: 'string',
              description: 'Optional initial UTF-8 content. Supported only for text MIME types.',
            },
          },
          required: ['tempFileName'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'temp_file_remove',
        description: 'Removes a file.',
        parameters: {
          type: 'object',
          properties: {
            tempFileName: {
              type: 'string',
              description: tempFileNameDescription,
            },
          },
          required: ['tempFileName'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'temp_file_list',
        description: 'Lists files with their metadata.',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Optional wildcard filter applied to the complete tempFileName. Use "*" to match any sequence of characters, for example "report/*" or "report/draft*".',
            },
            owner: {
              type: 'string',
              description: 'Optional wildcard filter applied to the file owner, for example "*bruno*".',
            },
            maxResultCount: {
              type: 'integer',
              minimum: 1,
              description: 'Maximum number of files to return after filtering and sorting.',
            },
          },
          required: [],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'temp_file_read',
        description: `Reads a file as UTF-8 text. Binary data containing NUL bytes is returned as a safe hexadecimal preview. Reads exceeding ${this.maxFileReadChars} characters are automatically paginated; reuse nextReadArguments until truncated is false. Optionally includes absolute line numbers.`,
        parameters: {
          type: 'object',
          properties: {
            tempFileName: {
              type: 'string',
              description: tempFileNameDescription,
            },
            encoding: {
              type: 'string',
              enum: ['utf8'],
              description: 'Read as UTF-8 text.',
            },
            startLine: {
              anyOf: [
                { type: 'integer', minimum: 1 },
                { type: 'null' },
              ],
              description: 'First line to read, 1-based.',
            },
            endLine: {
              anyOf: [
                { type: 'integer', minimum: 1 },
                { type: 'null' },
              ],
              description: 'Last line to read, 1-based. When omitted with startLine, defaults to startLine + 100, limited to the actual last line.',
            },
            lineNumbers: {
              type: 'boolean',
              description: 'When true, prefixes every returned line with its absolute 1-based line number.',
            },
            pagination: {
              type: 'boolean',
              description: 'Internal continuation flag returned in nextReadArguments. Pass it through unchanged.',
            },
          },
          required: ['tempFileName'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'temp_file_insert',
        description: 'Inserts UTF-8 text into a text file.',
        parameters: {
          type: 'object',
          properties: {
            tempFileName: {
              type: 'string',
              description: tempFileNameDescription,
            },
            content: {
              type: 'string',
              description: 'UTF-8 text to insert.',
            },
            startLine: {
              anyOf: [
                { type: 'integer', minimum: 1 },
                { type: 'null' },
              ],
              description: 'Line before which the content is inserted. Use null to append the content exactly at the end of the file. Include a leading newline in content when needed.',
            },
          },
          required: ['tempFileName', 'content', 'startLine'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'temp_file_apply_diff',
        description: 'Applies one or more unified Git-style diff hunks to an existing text file. Read the relevant lines with lineNumbers enabled before constructing the diff.',
        parameters: {
          type: 'object',
          properties: {
            tempFileName: {
              type: 'string',
              description: tempFileNameDescription,
            },
            diff: {
              type: 'string',
              description: 'Unified Git-style diff containing one or more hunks for this file.',
            },
          },
          required: ['tempFileName', 'diff'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'temp_file_delete_lines',
        description: 'Deletes a line range from a text file.',
        parameters: {
          type: 'object',
          properties: {
            tempFileName: {
              type: 'string',
              description: tempFileNameDescription,
            },
            startLine: {
              type: 'integer',
              description: 'First line to delete, 1-based.',
              minimum: 1,
            },
            endLine: {
              type: 'integer',
              description: 'Last line to delete, 1-based.',
              minimum: 1,
            },
          },
          required: ['tempFileName', 'startLine', 'endLine'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'temp_file_search',
        description: `Searches text files with a JavaScript regular expression and returns matching lines. Returned content is limited to ${this.maxFileReadChars} characters per call.`,
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Wildcard filter applied to complete tempFileName values, for example "js/*" or "project/src/*.js".',
            },
            pattern: {
              type: 'string',
              description: 'JavaScript regular expression pattern, without enclosing slashes. Example: "error|warning", not "/error|warning/i".',
            },
            flags: {
              type: 'string',
              description: 'JavaScript regexp flags, for example "", "i", "m", "s", "u", or combinations. "g" is added automatically.',
            },
            contextLines: {
              type: 'integer',
              minimum: 0,
              description: 'Number of lines to include before and after each matching line.',
            },
            maxResults: {
              type: 'integer',
              minimum: 1,
              description: 'Maximum number of matches to return.',
            },
            outputFormat: {
              type: 'string',
              enum: ['grep', 'json'],
              description: 'Output format. "grep" returns file:line:content text (default). "json" returns the structured format.',
            },
          },
          required: ['name', 'pattern'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'temp_file_save_as',
        description: 'Saves a file under a new name, optionally decoding base64 source text into binary output.',
        parameters: {
          type: 'object',
          properties: {
            inputTempFileName: {
              type: 'string',
              description: 'Existing source file name.',
            },
            outputTempFileName: {
              type: 'string',
              description: tempFileNameDescription,
            },
            mimeType: {
              type: 'string',
              description: 'MIME type to set on output file.',
            },
            sourceEncoding: {
              type: 'string',
              enum: ['raw', 'base64'],
              description: 'How to process the source data: "raw" copies it unchanged, while "base64" decodes Base64 text into binary data.',
            },
            description: {
              type: 'string',
              description: 'Optional description for output file metadata.',
            },
            owner: {
              type: 'string',
              description: 'User who owns or is associated with this file. Use the display name available in the conversation.',
            },
          },
          required: ['inputTempFileName', 'outputTempFileName'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'temp_file_convert_html_to_text',
        description: 'Converts an HTML temporary file into a smaller readable plain text file. Use it before reading large HTML files when only their textual content is needed.',
        parameters: {
          type: 'object',
          properties: {
            inputFileName: {
              type: 'string',
              description: 'Existing HTML source file name in the current stream.',
            },
            outputFileName: {
              type: 'string',
              description: tempFileNameDescription,
            },
          },
          required: ['inputFileName', 'outputFileName'],
          additionalProperties: false,
        },
      },
    ];
  }

  async deleteGlobalFiles()
  {
    const query = new DbQueryAgentFiles();

    try
    {
      await query.search('"agent_uuid" = $1 AND "stream_uuid" IS NULL', [await this.#resolveAgentUuid()]);

      while (await query.next())
      {
        await query.file.delete();
      }
    }
    finally
    {
      query.close();
    }
  }

  async attachFilesToEvent(event, context = {})
  {
    const tempFileNames = new Set();

    const collect = (value) =>
    {
      if (Array.isArray(value))
      {
        for (const item of value)
        {
          collect(item);
        }

        return;
      }

      if (!value || typeof value !== 'object')
      {
        return;
      }

      if (value.storedInTempFile === true && typeof value.tempFileName === 'string')
      {
        tempFileNames.add(value.tempFileName);
      }

      for (const child of Object.values(value))
      {
        collect(child);
      }
    };

    if (event.type === 'input_file' || event.type === 'input_image' || event.type === 'input_audio')
    {
      if (typeof event.data?.tempFileName === 'string')
      {
        tempFileNames.add(event.data.tempFileName);
      }
    }

    collect(event.data);

    for (const tempFileName of tempFileNames)
    {
      const file = await this.#getDbFile(event.streamId, tempFileName, context, { content: false });

      if (!file)
      {
        continue;
      }

      file.eventUuid = event.uuid;
      await file.save();
    }
  }

  processToolData(toolName)
  {
    return !['temp_file_list', 'temp_file_read', 'temp_file_search'].includes(toolName);
  }


  get usage()
  {
    return `
    - Manage files.
    - Read, insert, search, delete-lines, and apply-diff operations support text files only.
    - Use dedicated processing skills for structured or binary files.
    - File names may include "/" for logical organization, for example "myFolder/myFile.txt".
    - File names must include an extension matching the actual file format.
    - Use the exact tempFileName returned by tools.
    - Prefer lineNumbers: true before constructing a diff.
    - Prefer temp_file_search when looking for specific text.
    - Use temp_file_convert_html_to_text to convert an HTML attachment or file to plain text before reading it with temp_file_read.

    Read limits:
    - Reads exceeding ${this.maxFileReadChars} characters are automatically paginated.
    - Follow nextReadArguments unchanged until truncated is false.

    Reading large files:
    - Follow nextReadArguments unchanged until truncated is false.

    Folders:
    - Organize related files using "/"-separated logical folders.
    - New user-facing files should normally use the current date as their top-level folder in YYYYMMDD format.
    - Organize subfolders freely according to the task.
    - Examples: "20260722/report/source.txt", "20260722/images/chart.png", or "20260722/notes.txt".
    - Do not place multiple unrelated files at the root.
    - Internal technical files may use reserved paths such as "internal/tool/results/..." or "internal/tool/arguments/...".
    - Folders do not exist separately; the complete tempFileName identifies the file.

    Large file creation and writing:
    - Large files can be written in one call or in several calls.
    - After writing, read or validate the resulting file when correctness is important.

    Displaying file lists:
    - When displaying a list of files to the user, use a fixed-width text block with the following format.

    Icons:
    📁 = folder/directory
    🧩 = JavaScript file (.js)
    📝 = text/data file (.md, .txt, .json, .csv, .yml, .yaml, .xml, .html)
    🖼 = image (.png, .jpg, .jpeg, .gif, .webp)
    📕 = PDF
    📊 = spreadsheet/presentation (.xlsx, .ods, .pptx, .odp)
    📑 = Office document (.docx, .odt)
    🎵 = audio file (.mp3, .wav, .ogg, .flac, .m4a)
    📦 = zip or compressed file
    ⚙️ = internal/temporary file
    ✅ = important or validated file

    Format:
    📁 folder/
    ├── 📁 subfolder/
    │   ├── 📝 file.txt — Description
    │   └── 📝 data.json — 18 Ko
    ├── 🧩 script.js  — 10 Ko
    ├── 📊 results.xlsx
    ├── 🖼 chart.png — 164 Ko
    ├── 🎵 audio.mp3
    └── 📕 document.pdf — 364 Ko
    .

    Rules:
    - Use "├── " for all items except the last item in a group.
    - Use "└── " for the last item in a group.
    - Indent nested folders with "│   ".
    - Add " — description" after the file name when a useful description is available.
    - Show the file size only when known. Never estimate it.
    - Use French size units when displaying sizes: o, Ko, Mo, or Go.
    - Group files by logical folder and sort items alphabetically.
    - always add a line with a dot at the end of the list
    `;
  }

  getHumanReadableToolAction(toolName, args = {})
  {
    const toolNameReadable = {
      temp_file_create: '📄 creating temporary file',
      temp_file_read: '👀 reading file',
      temp_file_insert: '✍️ writing file',
      temp_file_delete_lines: '✍️ editing file',
      temp_file_search: '🔎 searching in file',
      temp_file_apply_diff: '🩹 applying file diff',
      temp_file_list: '📋 listing temporary files',
      temp_file_remove: '🗑️ removing temporary file',
      temp_file_save_as: '💾 saving file',
      temp_file_convert_html_to_text: '🔄 converting HTML to text',
    }[toolName];

    if (toolNameReadable == null)
    {
      return super.getHumanReadableToolAction(toolName, args);
    }

    let toolArgsReadable = '';

    switch (toolName)
    {
      case 'temp_file_create':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.tempFileName, 64);
        break;
      }

      case 'temp_file_read':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.tempFileName, 64);
        break;
      }

      case 'temp_file_insert':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.tempFileName, 64);
        break;
      }

      case 'temp_file_delete_lines':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.tempFileName, 64);
        break;
      }

      case 'temp_file_search':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.name, 64);
        break;
      }

      case 'temp_file_apply_diff':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.tempFileName, 64);
        break;
      }

      case 'temp_file_list':
      {
        toolArgsReadable = '';
        break;
      }

      case 'temp_file_remove':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.tempFileName, 64);
        break;
      }

      case 'temp_file_save_as':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.outputTempFileName, 64);
        break;
      }

      case 'temp_file_convert_html_to_text':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args?.inputFileName, 64);
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


  async getFiles(streamId, context = {})
  {
    const normalizedStreamId = this._resolveStreamId(streamId);
    const stream = normalizedStreamId === Agent.GLOBAL_STREAM_ID
      ? null
      : await this.#resolveStream(this._resolveChannelUid(normalizedStreamId, context), normalizedStreamId, { create: false });

    if (normalizedStreamId !== Agent.GLOBAL_STREAM_ID && !stream)
    {
      return new Map();
    }

    const query = new DbQueryAgentFiles();
    const files = new Map();

    try
    {
      const filter = normalizedStreamId === Agent.GLOBAL_STREAM_ID
        ? '"agent_uuid" = $1 AND "stream_uuid" IS NULL AND "active" = TRUE'
        : '"stream_uuid" = $1 AND "active" = TRUE';
      const filterValue = normalizedStreamId === Agent.GLOBAL_STREAM_ID ? await this.#resolveAgentUuid() : stream.uuid;
      await query.search(filter, [filterValue], { order: '"name" ASC' });

      while (await query.next())
      {
        files.set(query.file.name, this._toFileRecord(query.file, query.size));
      }
    }
    finally
    {
      query.close();
    }

    return files;
  }

  async _getReadableFiles(streamId, context = {})
  {
    const normalizedStreamId = this._resolveStreamId(streamId);
    const streamFiles = await this.getFiles(normalizedStreamId, context);

    if (normalizedStreamId === Agent.GLOBAL_STREAM_ID)
    {
      return streamFiles;
    }

    const combinedFiles = new Map(await this.getFiles(Agent.GLOBAL_STREAM_ID, context));

    for (const [tempFileName, file] of streamFiles.entries())
    {
      combinedFiles.set(tempFileName, file);
    }

    return combinedFiles;
  }

  async temp_file_create({ tempFileName, mimeType = null, description = null, owner = null, content = null }, context = {})
  {
    const streamId = context.streamId;
    const normalizedTempFileName = this._normalizeTempFileName(tempFileName, 'tempFileName');

    if (!AgentUtils.hasFileExtension(normalizedTempFileName))
    {
      throw new Error(`File name must include an extension: ${normalizedTempFileName}`);
    }

    const normalizedMimeType = this._resolveMimeType(normalizedTempFileName, mimeType);
    const normalizedOwner = owner == null ? null : String(owner);
    let data = Buffer.alloc(0);

    if (content != null)
    {
      if (!AgentUtils.isTextMimeType(normalizedMimeType))
      {
        throw new Error(
          `Initial content is supported only for text MIME types. ` +
          `File "${normalizedTempFileName}" has MIME type "${normalizedMimeType}".`
        );
      }

      const normalizedContent = String(content).replace(/\r\n/g, '\n');
      data = Buffer.from(normalizedContent, 'utf8');
    }

    if ((await this.getFiles(streamId, context)).has(normalizedTempFileName))
    {
      throw new Error(`File already exists: ${normalizedTempFileName}`);
    }

    await this.createFile({
      streamId,
      tempFileName: normalizedTempFileName,
      mimeType: normalizedMimeType,
      description,
      owner: normalizedOwner,
      permanent: false,
      data,
    }, context);

    return `File created: ${normalizedTempFileName} (${normalizedMimeType}) size=${data.length}`;
  }

  async temp_file_remove({ tempFileName }, context = {})
  {
    const streamId = context.streamId;
    const normalizedTempFileName = this._normalizeTempFileName(tempFileName, 'tempFileName');
    await this._assertMutableFile(normalizedTempFileName, streamId, context);
    const file = await this.#getDbFile(streamId, normalizedTempFileName, context);
    await file.delete();
    return `File removed: ${normalizedTempFileName}`;
  }

  async temp_file_list({ name = null, owner = null, maxResultCount = 1000 } = {}, context = {})
  {
    const streamId = context.streamId;
    const normalizedName = name == null ? null : String(name);
    const normalizedOwner = owner == null ? null : String(owner);
    const nameFilter = normalizedName == null ? null : this._buildWildcardFilterRegex(normalizedName);
    const ownerFilter = normalizedOwner == null ? null : this._buildWildcardFilterRegex(normalizedOwner);

    if (!Number.isInteger(maxResultCount) || maxResultCount < 1)
    {
      throw new Error('maxResultCount must be an integer greater than or equal to 1');
    }

    const files = [...(await this._getReadableFiles(streamId, context)).entries()]
      .filter(([fileName, file]) =>
      {
        if (nameFilter && !nameFilter.test(fileName))
        {
          return false;
        }

        if (ownerFilter)
        {
          if (file.owner == null)
          {
            return false;
          }

          return ownerFilter.test(String(file.owner));
        }

        return true;
      })
      .sort(([leftName], [rightName]) => leftName.localeCompare(rightName, undefined, { sensitivity: 'base' }));

    const totalMatchingFileCount = files.length;
    const returnedEntries = files.slice(0, maxResultCount);
    const returnedFileCount = returnedEntries.length;
    const truncated = totalMatchingFileCount > returnedFileCount;

    return JSON.stringify(
      {
        totalMatchingFileCount,
        returnedFileCount,
        truncated,
        files: returnedEntries.map(([fileName, file]) => ({
          tempFileName: fileName,
          mimeType: file.mimeType,
          size: file.size,
          dateCreated: file.dateCreated,
          description: file.description,
          owner: file.owner,
        })),
      },
      null,
      2,
    );
  }

  async temp_file_read({
    tempFileName,
    encoding = 'utf8',
    startLine,
    endLine,
    lineNumbers = false,
    pagination = false,
    applyLimit = true,
    allowBinaryBase64 = false,
  }, context = {})
  {
    const streamId = context.streamId;
    const normalizedTempFileName = this._normalizeTempFileName(tempFileName, 'tempFileName');
    const file = await this._getFile(normalizedTempFileName, streamId, true, context);

    if (encoding !== 'utf8' && encoding !== 'base64')
    {
      throw new Error(`Unsupported encoding: ${encoding}`);
    }

    if (typeof lineNumbers !== 'boolean')
    {
      throw new Error('lineNumbers must be a boolean when provided');
    }

    let content;
    let lineCount;

    if (encoding === 'base64')
    {
      if (!allowBinaryBase64)
      {
        throw new Error(
          'temp_file_read only supports utf8 text files. ' +
          'For other file types, use an appropriate dedicated tool.'
        );
      }

      if (startLine != null || endLine != null)
      {
        throw new Error('Line-based reading is supported only for utf8 text encoding');
      }

      if (lineNumbers)
      {
        throw new Error('lineNumbers is supported only for utf8 text encoding');
      }

      content = file.data.toString('base64');
    }
    else
    {
      const decodedFile = await this._decodeTextFile(normalizedTempFileName, streamId, context, true);
      lineCount = decodedFile.lines.length;
      const hasStartLine = startLine != null;
      const hasEndLine = endLine != null;
      const hasImplicitEndLine = hasStartLine && !hasEndLine;

      if (!hasStartLine && hasEndLine)
      {
        throw new Error('startLine must be provided when endLine is provided');
      }

      if (hasImplicitEndLine)
      {
        endLine = Math.min(startLine + 100, lineCount);
      }

      let lines = decodedFile.lines;
      let firstLineNumber = 1;
      let lastLineNumber = decodedFile.lines.length;

      if (hasStartLine)
      {
        if (endLine < startLine)
        {
          throw new Error('endLine must be greater than or equal to startLine');
        }

        lines = decodedFile.lines.slice(startLine - 1, endLine);
        firstLineNumber = startLine;
        lastLineNumber = Math.min(endLine, decodedFile.lines.length);
      }

      const renderedLines = lineNumbers
        ? lines.map((line, index) => `${firstLineNumber + index} | ${line}`)
        : lines;

      content = renderedLines.join('\n');

      if (content.includes('\0'))
      {
        const previewBytes = file.data.subarray(0, 64);
        const hexadecimal = [...previewBytes].map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        const ascii = [...previewBytes].map((byte) => byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.').join('');
        content = `Binary data preview:\n${hexadecimal}\nASCII: ${ascii}`;
        lineCount = null;
      }
      else if (applyLimit && content.length > this.maxFileReadChars)
      {
        if (renderedLines[0].length > this.maxFileReadChars)
        {
          throw new Error(
            `A single line in "${normalizedTempFileName}" exceeds the ${this.maxFileReadChars}-character read limit; ` +
            'pagination by lines is impossible. Use temp_file_search or a specialized tool.'
          );
        }

        let pageLength = 0;
        let pageLineCount = 0;

        for (const line of renderedLines)
        {
          const nextLength = pageLength + (pageLineCount > 0 ? 1 : 0) + line.length;

          if (nextLength > this.maxFileReadChars)
          {
            break;
          }

          pageLength = nextLength;
          pageLineCount += 1;
        }

        const pageEndLine = firstLineNumber + pageLineCount - 1;

        return {
          content: renderedLines.slice(0, pageLineCount).join('\n'),
          truncated: true,
          startLine: firstLineNumber,
          endLine: pageEndLine,
          totalLineCount: lineCount,
          nextReadArguments: {
            tempFileName: normalizedTempFileName,
            startLine: pageEndLine + 1,
            endLine: lastLineNumber,
            ...(lineNumbers ? { lineNumbers: true } : {}),
            pagination: true,
          },
        };
      }

      if (pagination || hasImplicitEndLine)
      {
        return {
          content,
          truncated: false,
          startLine: firstLineNumber,
          endLine: lastLineNumber,
          totalLineCount: lineCount,
          nextReadArguments: null,
        };
      }
    }

    return content;
  }

  async temp_file_insert({ tempFileName, content, startLine }, context = {})
  {
    const streamId = context.streamId;
    const normalizedTempFileName = this._normalizeTempFileName(tempFileName, 'tempFileName');
    await this._assertMutableFile(normalizedTempFileName, streamId, context);

    if (!AgentUtils.hasFileExtension(normalizedTempFileName))
    {
      throw new Error(`File name must include an extension: ${normalizedTempFileName}`);
    }

    const normalizedContent = String(content).replace(/\r\n/g, '\n');
    const decodedFile = await this._decodeTextFile(normalizedTempFileName, streamId, context);

    if (startLine === null)
    {
      const updatedText = decodedFile.normalizedText + normalizedContent;

      decodedFile.lines = this._splitNormalizedLines(updatedText);
      decodedFile.hasFinalNewline = updatedText.endsWith('\n');
      await this._encodeTextFile(normalizedTempFileName, decodedFile, streamId, context);

      return `Appended text to ${normalizedTempFileName}`;
    }

    if (!Number.isInteger(startLine) || startLine < 1)
    {
      throw new Error('startLine must be an integer greater than or equal to 1, or null');
    }

    const maxStartLine = decodedFile.lines.length + 1;

    if (startLine > maxStartLine)
    {
      throw new Error(
        `startLine ${startLine} is beyond the end of file. Maximum allowed value is ${maxStartLine}.`
      );
    }

    const updatedLines = [...decodedFile.lines];
    const insertLines = normalizedContent.split('\n');
    const startIndex = startLine - 1;

    updatedLines.splice(startIndex, 0, ...insertLines);

    decodedFile.lines = updatedLines;
    await this._encodeTextFile(normalizedTempFileName, decodedFile, streamId, context);

    return `Inserted ${insertLines.length} line(s) into ${normalizedTempFileName} at line ${startLine}`;
  }

  async temp_file_apply_diff({ tempFileName, diff }, context = {})
  {
    const streamId = context.streamId;
    const normalizedTempFileName = this._normalizeTempFileName(tempFileName, 'tempFileName');
    await this._assertMutableFile(normalizedTempFileName, streamId, context);

    const fail = (error, details = {}) =>
    {
      throw new Error(
        JSON.stringify({
          ok: false,
          error,
          tempFileName: normalizedTempFileName,
          ...details,
        })
      );
    };

    const parseHunkHeader = (line, lineNumber) =>
    {
      const match = line.match(/^(@@\s*-(\d+))(?:,(\d+))?(\s+\+(\d+))(?:,(\d+))?(\s*@@)(.*)$/);

      if (!match)
      {
        throw new Error(`Invalid hunk header at line ${lineNumber}.`);
      }

      const oldStart = Number(match[2]);
      const declaredOldCount = match[3] === undefined ? 1 : Number(match[3]);
      const newStart = Number(match[5]);
      const declaredNewCount = match[6] === undefined ? 1 : Number(match[6]);

      if (
        !Number.isInteger(oldStart) ||
        !Number.isInteger(declaredOldCount) ||
        !Number.isInteger(newStart) ||
        !Number.isInteger(declaredNewCount) ||
        oldStart < 0 ||
        declaredOldCount < 0 ||
        newStart < 0 ||
        declaredNewCount < 0
      )
      {
        throw new Error(`Invalid hunk header at line ${lineNumber}.`);
      }

      if (oldStart === 0 && declaredOldCount !== 0)
      {
        throw new Error(`Invalid hunk header at line ${lineNumber}: -0 must use count 0.`);
      }

      return {
        oldStart,
        newStart,
        declaredOldCount,
        declaredNewCount,
        oldCountSegment: match[3] === undefined ? '' : `,${match[3]}`,
        newCountSegment: match[6] === undefined ? '' : `,${match[6]}`,
        originalHeader: line,
        oldPrefix: match[1],
        newPrefix: match[4],
        atToken: match[7],
        suffix: match[8] ?? '',
      };
    };

    const buildCorrectedHunkHeader = (header, actualOldCount, actualNewCount) =>
    {
      const oldCountPart = actualOldCount === header.declaredOldCount
        ? header.oldCountSegment
        : `,${actualOldCount}`;

      const newCountPart = actualNewCount === header.declaredNewCount
        ? header.newCountSegment
        : `,${actualNewCount}`;

      return `${header.oldPrefix}${oldCountPart}${header.newPrefix}${newCountPart}${header.atToken}${header.suffix}`;
    };

    const blockMatchesAt = (lines, block, index) =>
    {
      if (index < 0 || index + block.length > lines.length)
      {
        return false;
      }

      return block.every((line, offset) =>
        lines[index + offset].trimEnd() === line.trimEnd()
      );
    };

    const findBlockMatches = (lines, block) =>
    {
      if (!block.length)
      {
        return Array.from({ length: lines.length + 1 }, (_, index) => index);
      }

      const matches = [];

      for (let index = 0; index <= lines.length - block.length; index++)
      {
        if (blockMatchesAt(lines, block, index))
        {
          matches.push(index);
        }
      }

      return matches;
    };

    const applyDiffHunk = ({ lines, hunk, hunkIndex, lineOffset }) =>
    {
      const rawExpectedIndex = hunk.oldStart === 0 ? 0 : hunk.oldStart - 1 + lineOffset;
      const expectedIndex = Math.max(0, Math.min(lines.length, rawExpectedIndex));
      let targetIndex = expectedIndex;

      if (!blockMatchesAt(lines, hunk.oldBlock, expectedIndex))
      {
        const matches = findBlockMatches(lines, hunk.oldBlock);

        if (matches.length !== 1)
        {
          const ambiguous = matches.length > 1;
          const details = ambiguous
            ? 'Multiple matching locations were found for this hunk.'
            : 'The context and removed lines do not match the current file.';
          const error = new Error(details);

          error.code = ambiguous ? 'HUNK_AMBIGUOUS' : 'HUNK_NOT_APPLICABLE';
          error.hunkIndex = hunkIndex;
          error.expectedLine = Math.max(1, expectedIndex + 1);
          error.details = details;
          error.oldBlock = hunk.oldBlock.join('\n');

          throw error;
        }

        targetIndex = matches[0];
      }

      lines.splice(targetIndex, hunk.oldBlock.length, ...hunk.newBlock);

      return {
        lineOffsetDelta: hunk.newBlock.length - hunk.oldBlock.length,
        linesAdded: hunk.linesAdded,
        linesRemoved: hunk.linesRemoved,
      };
    };

    const parseUnifiedDiff = (rawDiff) =>
    {
      const normalizedDiff = rawDiff.replace(/\r\n/g, '\n');

      if (!normalizedDiff.trim())
      {
        throw new Error('Diff is empty.');
      }

      const lines = normalizedDiff.split('\n');
      const hunks = [];
      let lineIndex = 0;

      while (lineIndex < lines.length)
      {
        const line = lines[lineIndex];

        if (!line.trim())
        {
          lineIndex++;
          continue;
        }

        if (line.startsWith('--- ') || line.startsWith('+++ '))
        {
          lineIndex++;
          continue;
        }

        if (!line.startsWith('@@'))
        {
          throw new Error(`Invalid diff line ${lineIndex + 1}: expected a hunk header.`);
        }

        const header = parseHunkHeader(line, lineIndex + 1);
        const headerLineIndex = lineIndex;

        lineIndex++;

        const oldBlock = [];
        const newBlock = [];
        let linesAdded = 0;
        let linesRemoved = 0;

        while (lineIndex < lines.length)
        {
          const hunkLine = lines[lineIndex];

          if (hunkLine === '' && lines.slice(lineIndex).every((item) => item === ''))
          {
            lineIndex = lines.length;
            break;
          }

          if (hunkLine.startsWith('@@'))
          {
            break;
          }

          if (hunkLine.startsWith('--- ') || hunkLine.startsWith('+++ '))
          {
            break;
          }

          if (hunkLine.startsWith('\\ No newline at end of file'))
          {
            lineIndex++;
            continue;
          }

          const normalizedHunkLine = hunkLine === '' ? ' ' : hunkLine;
          const marker = normalizedHunkLine[0];

          if (marker !== ' ' && marker !== '+' && marker !== '-')
          {
            throw new Error(`Invalid hunk line ${lineIndex + 1}: each line must start with " ", "+", or "-".`);
          }

          const text = normalizedHunkLine.slice(1);

          if (marker !== '+')
          {
            oldBlock.push(text);
          }

          if (marker !== '-')
          {
            newBlock.push(text);
          }

          if (marker === '+')
          {
            linesAdded++;
          }
          else if (marker === '-')
          {
            linesRemoved++;
          }

          lineIndex++;
        }

        const actualOldCount = oldBlock.length;
        const actualNewCount = newBlock.length;
        const countsCorrected =
          actualOldCount !== header.declaredOldCount ||
          actualNewCount !== header.declaredNewCount;

        const correctedHeader = countsCorrected
          ? buildCorrectedHunkHeader(header, actualOldCount, actualNewCount)
          : header.originalHeader;

        hunks.push({
          ...header,
          oldCount: actualOldCount,
          newCount: actualNewCount,
          actualOldCount,
          actualNewCount,
          countsCorrected,
          correctedHeader,
          headerLineIndex,
          oldBlock,
          newBlock,
          linesAdded,
          linesRemoved,
        });
      }

      if (!hunks.length)
      {
        throw new Error('Diff does not contain any hunk.');
      }

      const hunkCorrections = hunks
        .map((hunk, index) =>
        {
          if (!hunk.countsCorrected)
          {
            return null;
          }

          return {
            hunkIndex: index + 1,
            declaredOldCount: hunk.declaredOldCount,
            actualOldCount: hunk.actualOldCount,
            declaredNewCount: hunk.declaredNewCount,
            actualNewCount: hunk.actualNewCount,
            originalHeader: hunk.originalHeader,
            correctedHeader: hunk.correctedHeader,
          };
        })
        .filter(Boolean);

      const diffCorrected = hunkCorrections.length > 0;

      return {
        hunks,
        diffCorrected,
        hunkCorrections,
      };
    };

    if (typeof diff !== 'string' || !diff.trim())
    {
      fail('INVALID_DIFF', {
        details: 'Diff must be a non-empty string.',
      });
    }

    let decodedFile;

    try
    {
      decodedFile = await this._decodeTextFile(normalizedTempFileName, streamId, context);
    }
    catch (error)
    {
      const message = String(error?.message ?? error);

      if (message.startsWith('File not found:'))
      {
        fail('FILE_NOT_FOUND', {
          details: message,
        });
      }

      fail('INVALID_FILE_TYPE', {
        details: message,
      });
    }

    let parsedDiff;

    try
    {
      parsedDiff = parseUnifiedDiff(diff);
    }
    catch (error)
    {
      fail('INVALID_DIFF', {
        details: String(error?.message ?? error),
      });
    }

    const {
      hunks,
      diffCorrected,
      hunkCorrections,
    } = parsedDiff;

    const workingLines = [...decodedFile.lines];
    let lineOffset = 0;
    let linesAdded = 0;
    let linesRemoved = 0;

    for (let index = 0; index < hunks.length; index++)
    {
      const hunk = hunks[index];

      try
      {
        const applyResult = applyDiffHunk({
          lines: workingLines,
          hunk,
          hunkIndex: index + 1,
          lineOffset,
        });

        lineOffset += applyResult.lineOffsetDelta;
        linesAdded += applyResult.linesAdded;
        linesRemoved += applyResult.linesRemoved;
      }
      catch (error)
      {
        fail(error.code ?? 'HUNK_NOT_APPLICABLE', {
          hunkIndex: error.hunkIndex ?? index + 1,
          expectedLine: error.expectedLine ?? hunk.oldStart,
          details: error.details ?? String(error?.message ?? error),
          oldBlock: error.oldBlock ?? hunk.oldBlock.join('\n'),
        });
      }
    }

    try
    {
      decodedFile.lines = workingLines;
      await this._encodeTextFile(normalizedTempFileName, decodedFile, streamId, context);
    }
    catch (error)
    {
      fail('WRITE_ERROR', {
        details: String(error?.message ?? error),
      });
    }

    const result = {
      ok: true,
      tempFileName: normalizedTempFileName,
      hunksApplied: hunks.length,
      linesAdded,
      linesRemoved,
    };

    if (diffCorrected)
    {
      result.diffCorrected = true;
      result.hunkCorrections = hunkCorrections;
    }

    return result;
  }

  async temp_file_delete_lines({ tempFileName, startLine, endLine }, context = {})
  {
    const streamId = context.streamId;
    const normalizedTempFileName = this._normalizeTempFileName(tempFileName, 'tempFileName');
    await this._assertMutableFile(normalizedTempFileName, streamId, context);

    if (endLine < startLine)
    {
      throw new Error('endLine must be greater than or equal to startLine');
    }

    const decodedFile = await this._decodeTextFile(normalizedTempFileName, streamId, context);
    const updatedLines = [...decodedFile.lines];

    updatedLines.splice(startLine - 1, endLine - startLine + 1);

    decodedFile.lines = updatedLines;
    await this._encodeTextFile(normalizedTempFileName, decodedFile, streamId, context);

    return `Deleted lines ${startLine} to ${endLine} from ${normalizedTempFileName}`;
  }

  async temp_file_search({ name, pattern, flags = '', contextLines = 0, maxResults = 50, outputFormat = 'grep' }, context = {})
  {
    const streamId = context.streamId;
    const normalizedName = String(name);
    const normalizedOutputFormat = String(outputFormat ?? 'grep').toLowerCase();

    if (normalizedOutputFormat !== 'grep' && normalizedOutputFormat !== 'json')
    {
      throw new Error('outputFormat must be "grep" or "json"');
    }

    if (!Number.isInteger(contextLines) || contextLines < 0)
    {
      throw new Error('contextLines must be an integer greater than or equal to 0');
    }

    if (!Number.isInteger(maxResults) || maxResults < 1)
    {
      throw new Error('maxResults must be an integer greater than or equal to 1');
    }

    const nameFilter = this._buildWildcardFilterRegex(normalizedName);
    const matchingFiles = [...(await this._getReadableFiles(streamId, context)).entries()]
      .filter(([tempFileName]) => nameFilter.test(tempFileName))
      .sort(([leftName], [rightName]) =>
        leftName.localeCompare(rightName, undefined, { sensitivity: 'base' })
      );

    const regexpFlags = flags.includes('g') ? flags : `${flags}g`;
    const regexp = new RegExp(pattern, regexpFlags);

    const files = [];
    const grepLines = [];

    let grepLength = 0;
    let totalCount = 0;
    let truncated = false;

    const pushGrepLine = (line) =>
    {
      const separatorLength = grepLines.length > 0 ? 1 : 0;
      const remainingLength = this.maxFileReadChars - grepLength - separatorLength;

      if (remainingLength <= 0)
      {
        return false;
      }

      if (line.length > remainingLength)
      {
        grepLines.push(line.slice(0, remainingLength));
        grepLength += separatorLength + remainingLength;
        return false;
      }

      grepLines.push(line);
      grepLength += separatorLength + line.length;

      return true;
    };

    const buildJsonResult = (currentFileName = null, currentFileResults = null) =>
    {
      const resultFiles = [...files];

      if (currentFileName != null && currentFileResults?.length)
      {
        resultFiles.push({
          tempFileName: currentFileName,
          count: currentFileResults.length,
          results: currentFileResults,
        });
      }

      return JSON.stringify({
        name: normalizedName,
        pattern,
        flags: regexpFlags,
        truncated,
        count: totalCount,
        files: resultFiles,
      }, null, 2);
    };

    for (const [tempFileName, file] of matchingFiles)
    {
      if (!AgentUtils.isTextMimeType(file.mimeType))
      {
        continue;
      }

      const lines = (await this._decodeTextFile(tempFileName, streamId, context)).lines;
      const fileResults = [];

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++)
      {
        const line = lines[lineIndex];

        regexp.lastIndex = 0;

        /*
        * Search is line-oriented:
        * one result per matching line, regardless of how many times
        * the regular expression matches inside that line.
        */
        const match = regexp.exec(line);

        if (!match)
        {
          continue;
        }

        const startLineIndex = Math.max(1, lineIndex + 1 - contextLines);
        const endLineIndex = Math.min(lines.length, lineIndex + 1 + contextLines);

        if (normalizedOutputFormat === 'json')
        {
          const result = {
            line: lineIndex + 1,
            column: match.index + 1,
            match: match[0],
            groups: match.slice(1),
            text: line,
            context: lines
              .slice(startLineIndex - 1, endLineIndex)
              .map((content, index) => ({
                line: startLineIndex + index,
                text: content,
              })),
          };

          fileResults.push(result);
          totalCount++;

          const output = buildJsonResult(tempFileName, fileResults);

          if (output.length > this.maxFileReadChars)
          {
            fileResults.pop();
            totalCount--;
            truncated = true;
            break;
          }
        }
        else
        {
          let complete = true;

          if (contextLines === 0)
          {
            complete = pushGrepLine(
              `${tempFileName}:${lineIndex + 1}: ${line}`
            );
          }
          else
          {
            const contextBlock = lines.slice(startLineIndex - 1, endLineIndex);
            const prefix = `${tempFileName}:${startLineIndex}-${endLineIndex}:`;
            const indent = ' '.repeat(prefix.length + 1);

            for (let contextIndex = 0; contextIndex < contextBlock.length; contextIndex++)
            {
              const outputLine = contextIndex === 0
                ? `${prefix} ${contextBlock[contextIndex] ?? ''}`
                : `${indent}${contextBlock[contextIndex]}`;

              if (!pushGrepLine(outputLine))
              {
                complete = false;
                break;
              }
            }
          }

          totalCount++;

          if (!complete)
          {
            truncated = true;
            break;
          }
        }

        if (totalCount >= maxResults)
        {
          truncated = true;
          break;
        }
      }

      if (normalizedOutputFormat === 'json' && fileResults.length > 0)
      {
        files.push({
          tempFileName,
          count: fileResults.length,
          results: fileResults,
        });
      }

      if (truncated)
      {
        break;
      }
    }

    if (normalizedOutputFormat === 'json')
    {
      return JSON.stringify({
        name: normalizedName,
        pattern,
        flags: regexpFlags,
        truncated,
        count: totalCount,
        files,
      }, null, 2);
    }

    return grepLines.join('\n');
  }

  async temp_file_save_as({ inputTempFileName, outputTempFileName, mimeType = null, sourceEncoding = 'raw', description = null, owner = null }, context = {})
  {
    const streamId = context.streamId;
    const normalizedInputTempFileName = this._normalizeTempFileName(inputTempFileName, 'inputTempFileName');
    const normalizedOutputTempFileName = this._normalizeTempFileName(outputTempFileName, 'outputTempFileName');
    const normalizedMimeType = this._resolveMimeType(normalizedOutputTempFileName, mimeType);
    const normalizedSourceEncoding = AgentUtils.normalizeRequiredString(sourceEncoding, 'sourceEncoding').toLowerCase();

    if (!AgentUtils.hasFileExtension(normalizedOutputTempFileName))
    {
      throw new Error(`File name must include an extension: ${normalizedOutputTempFileName}`);
    }

    if (!['raw', 'base64'].includes(normalizedSourceEncoding))
    {
      throw new Error(`Unsupported sourceEncoding: ${normalizedSourceEncoding}. Supported values are "raw" and "base64".`);
    }

    const sourceFile = await this._getFile(normalizedInputTempFileName, streamId, true, context);
    const normalizedDescription = description == null
      ? sourceFile.description
      : String(description);
    const normalizedOwner = owner == null
      ? sourceFile.owner
      : String(owner);

    let outputData;

    if (normalizedSourceEncoding === 'raw')
    {
      outputData = Buffer.from(sourceFile.data);
    }
    else
    {
      outputData = AgentUtils.decodeBase64(sourceFile.data.toString('utf8'));
    }

    if ((await this.getFiles(streamId, context)).has(normalizedOutputTempFileName))
    {
      throw new Error(`File already exists: ${normalizedOutputTempFileName}`);
    }

    await this.createFile({
      streamId,
      tempFileName: normalizedOutputTempFileName,
      mimeType: normalizedMimeType,
      description: normalizedDescription,
      owner: normalizedOwner,
      permanent: false,
      data: outputData,
    }, context);

    return {
      tempFileName: normalizedOutputTempFileName,
      mimeType: normalizedMimeType,
      size: outputData.length,
      description: normalizedDescription,
      owner: normalizedOwner,
    };
  }

  async temp_file_convert_html_to_text({ inputFileName, outputFileName }, context = {})
  {
    const streamId = context.streamId;
    const normalizedInputFileName = this._normalizeTempFileName(inputFileName, 'inputFileName');
    const normalizedOutputFileName = this._normalizeTempFileName(outputFileName, 'outputFileName');
    const inputFile = await this._getFile(normalizedInputFileName, streamId, false, context);

    if (!AgentUtils.isTextMimeType(inputFile.mimeType))
    {
      throw new Error(
        `HTML conversion requires a text source file. ` +
        `File "${normalizedInputFileName}" has MIME type "${inputFile.mimeType}".`
      );
    }

    const html = inputFile.data.toString('utf8');
    const text = this._convertHtmlToReadableText(html);
    const outputData = Buffer.from(text, 'utf8');
    const streamFiles = await this.getFiles(streamId, context);

    if (streamFiles.has(normalizedOutputFileName))
    {
      await this._assertMutableFile(normalizedOutputFileName, streamId, context);
    }

    await this.createFile({
      streamId,
      tempFileName: normalizedOutputFileName,
      mimeType: 'text/plain',
      description: null,
      owner: null,
      permanent: false,
      data: outputData,
    }, context);

    return {
      outputFileName: normalizedOutputFileName,
      mimeType: 'text/plain',
      size: outputData.length,
    };
  }

  async loadLocalFile({ filePath, tempFileName = null, mimeType = null, description = null, owner = null, permanent = true }, context = {})
  {
    const normalizedPath = AgentUtils.normalizeRequiredString(filePath, 'file path');
    const buffer = await readFile(normalizedPath);
    const providedTempFileName = tempFileName ?? path.basename(normalizedPath);
    const normalizedTempFileName = this._normalizeTempFileName(providedTempFileName, 'tempFileName');

    if (!AgentUtils.hasFileExtension(normalizedTempFileName))
    {
      throw new Error(`File name must include an extension: ${normalizedTempFileName}`);
    }

    const normalizedMimeType = this._resolveMimeType(normalizedTempFileName, mimeType);
    const normalizedOwner = owner == null ? null : String(owner);

    await this.createFile({
      streamId: Agent.GLOBAL_STREAM_ID,
      tempFileName: normalizedTempFileName,
      mimeType: normalizedMimeType,
      description,
      owner: normalizedOwner,
      permanent,
      data: buffer,
    }, context);

    return `File loaded: ${normalizedTempFileName} (${normalizedMimeType}) size=${buffer.length}`;
  }

  async loadLocalFolder({ folderPath, owner = null, permanent = true }, context = {})
  {
    const normalizedFolderPath = AgentUtils.normalizeRequiredString(folderPath, 'folder path');
    const normalizedOwner = owner == null ? null : String(owner);
    const loadedFiles = [];

    const walk = async (currentPath) =>
    {
      const entries = await readdir(currentPath, { withFileTypes: true });

      for (const entry of entries)
      {
        const entryPath = path.join(currentPath, entry.name);

        if (entry.isDirectory())
        {
          await walk(entryPath);
          continue;
        }

        if (!entry.isFile())
        {
          continue;
        }

        const relativePath = path.relative(normalizedFolderPath, entryPath).replace(/\\/g, '/');
        const normalizedTempFileName = this._normalizeTempFileName(relativePath, 'tempFileName');

        await this.loadLocalFile({
          filePath: entryPath,
          tempFileName: normalizedTempFileName,
          mimeType: null,
          description: null,
          owner: normalizedOwner,
          permanent,
        }, context);

        loadedFiles.push(normalizedTempFileName);
      }
    };

    await walk(normalizedFolderPath);
    loadedFiles.sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));

    return {
      folderPath: normalizedFolderPath,
      count: loadedFiles.length,
      files: loadedFiles,
    };
  }

  async appendBuffer({ tempFileName, data }, context = {})
  {
    const streamId = context.streamId;
    const normalizedTempFileName = this._normalizeTempFileName(tempFileName, 'tempFileName');
    await this._assertMutableFile(normalizedTempFileName, streamId, context);

    if (!AgentUtils.hasFileExtension(normalizedTempFileName))
    {
      throw new Error(`File name must include an extension: ${normalizedTempFileName}`);
    }

    if (!(data instanceof Uint8Array))
    {
      throw new Error('appendBuffer expects data to be a Buffer or Uint8Array');
    }

    const file = await this._getFile(normalizedTempFileName, streamId, false, context);
    const appended = Buffer.from(data);
    const updatedData = Buffer.concat([file.data, appended]);

    file.data = updatedData;
    await this._saveFileRecord(file, streamId, context);

    return `Appended ${appended.length} byte(s) to ${normalizedTempFileName}`;
  }

  async _getFile(tempFileName, streamId, allowGlobalFallback = true, context = {})
  {
    const normalizedStreamId = this._resolveStreamId(streamId);
    const streamFile = await this.#getDbFile(normalizedStreamId, tempFileName, context, { content: true });

    if (streamFile)
    {
      return this._toFileRecord(streamFile);
    }

    if (allowGlobalFallback && normalizedStreamId !== Agent.GLOBAL_STREAM_ID)
    {
      const globalFile = await this.#getDbFile(Agent.GLOBAL_STREAM_ID, tempFileName, context, { content: true });

      if (globalFile)
      {
        return this._toFileRecord(globalFile);
      }
    }

    throw new Error(`File not found: ${tempFileName}`);
  }

  async _assertMutableFile(tempFileName, streamId, context = {})
  {
    const file = await this._getFile(tempFileName, streamId, false, context);

    if (file.permanent)
    {
      throw new Error(permanentFileErrorMessage);
    }
  }

  _normalizeTempFileName(tempFileName, parameterName = 'tempFileName')
  {
    const normalizedRequiredTempFileName = AgentUtils.normalizeRequiredString(tempFileName, parameterName);
    const normalizedTempFileName = normalizedRequiredTempFileName.replace(/\\/g, '/').replace(/\/+/g, '/');

    if (normalizedTempFileName.startsWith('/') || normalizedTempFileName.endsWith('/'))
    {
      throw new Error(`Invalid ${parameterName}: "${normalizedTempFileName}". File name must not start or end with "/".`);
    }

    const segments = normalizedTempFileName.split('/');

    for (const segment of segments)
    {
      if (segment === '.' || segment === '..')
      {
        throw new Error(`Invalid ${parameterName}: "${normalizedTempFileName}". Segments "." and ".." are not allowed.`);
      }
    }

    return normalizedTempFileName;
  }

  _resolveMimeType(tempFileName, mimeType)
  {
    return mimeType
      ? AgentUtils.normalizeRequiredString(mimeType, 'mimeType')
      : AgentUtils.getMimeTypeFromExtension(path.extname(tempFileName).slice(1)) ?? 'application/octet-stream';
  }

  _convertHtmlToReadableText(html)
  {
    let text = String(html ?? '');

    text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '\n');
    text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '\n');
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/?p\b[^>]*>/gi, '\n\n');
    text = text.replace(/<\/?div\b[^>]*>/gi, '\n');
    text = text.replace(/<li\b[^>]*>/gi, '\n- ');
    text = text.replace(/<\/li\b[^>]*>/gi, '\n');
    text = text.replace(/<\/?tr\b[^>]*>/gi, '\n');
    text = text.replace(/<\/?h[1-6]\b[^>]*>/gi, '\n\n');
    text = text.replace(/<[^>]*>/g, '');
    text = this._decodeHtmlEntities(text);
    text = text.replace(/\r\n?/g, '\n');
    text = text
      .split('\n')
      .map((line) => line.replace(/[ \t\f\v]+/g, ' ').trim())
      .join('\n');
    text = text.replace(/\n{3,}/g, '\n\n');

    return text.trim();
  }

  _decodeHtmlEntities(text)
  {
    const namedEntities = {
      nbsp: ' ',
      amp: '&',
      lt: '<',
      gt: '>',
      quot: '"',
      '#39': "'",
    };

    return String(text ?? '')
      .replace(/&(#x[0-9a-f]+|#\d+|nbsp|amp|lt|gt|quot|#39);/gi, (match, entity) =>
      {
        const normalizedEntity = String(entity ?? '').toLowerCase();

        if (normalizedEntity.startsWith('#x'))
        {
          const codePoint = Number.parseInt(normalizedEntity.slice(2), 16);
          return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
        }

        if (normalizedEntity.startsWith('#'))
        {
          const codePoint = Number.parseInt(normalizedEntity.slice(1), 10);
          return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
        }

        return namedEntities[normalizedEntity] ?? match;
      });
  }

  _buildWildcardFilterRegex(value)
  {
    const escaped = value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    const pattern = `^${escaped.replace(/\*/g, '.*')}$`;
    return new RegExp(pattern, 'i');
  }

  async _decodeTextFile(tempFileName, streamId, context = {}, allowBinary = false)
  {
    const file = await this._getFile(tempFileName, streamId, true, context);

    if (!allowBinary && !AgentUtils.isTextMimeType(file.mimeType))
    {
      throw new Error(
        `Text operations are supported only for text files. ` +
        `File "${tempFileName}" has MIME type "${file.mimeType}". ` +
        'Use an appropriate dedicated tool for this file type.'
      );
    }

    const rawText = file.data.toString('utf8');
    const hasBom = rawText.startsWith('\uFEFF');
    const textWithoutBom = hasBom
      ? rawText.slice(1)
      : rawText;

    const normalizedText = textWithoutBom.replace(/\r\n/g, '\n');

    return {
      file,
      hasBom,
      eol: textWithoutBom.includes('\r\n') ? '\r\n' : '\n',
      hasFinalNewline: normalizedText.endsWith('\n'),
      normalizedText,
      lines: this._splitNormalizedLines(normalizedText),
    };
  }

  _splitNormalizedLines(text)
  {
    if (text === '')
    {
      return [];
    }

    if (text.endsWith('\n'))
    {
      return text.slice(0, -1).split('\n');
    }

    return text.split('\n');
  }

  async _encodeTextFile(tempFileName, decodedFile, streamId, context = {})
  {
    const { lines, hasFinalNewline, eol, hasBom } = decodedFile;
    const body = lines.join('\n');
    const normalizedText = hasFinalNewline && lines.length ? `${body}\n` : body;

    const textWithEol = eol === '\r\n'
      ? normalizedText.replace(/\n/g, '\r\n')
      : normalizedText;

    const finalText = hasBom
      ? `\uFEFF${textWithEol}`
      : textWithEol;

    const file = await this._getFile(tempFileName, streamId, false, context);
    file.data = Buffer.from(finalText, 'utf8');
    await this._saveFileRecord(file, streamId, context);
  }

  async createFile({ streamId, tempFileName, mimeType, description, owner = null, permanent, data }, context = {})
  {
    const file = {
      name: tempFileName,
      mimeType,
      data,
      description,
      owner,
      dateCreated: Date.now(),
      permanent,
      eventUuid: context.eventUuid ?? null,
    };

    await this._saveFileRecord(file, streamId, context);
    return file;
  }

  async _saveFileRecord(file, streamId, context = {})
  {
    const normalizedStreamId = this._resolveStreamId(streamId);
    const stream = normalizedStreamId === Agent.GLOBAL_STREAM_ID
      ? null
      : await this.#resolveStream(this._resolveChannelUid(normalizedStreamId, context), normalizedStreamId);
    const current = await this.#getDbFile(normalizedStreamId, file.name, context, { content: true });
    const dbFile = current ?? new AgentFile();

    if (!current)
    {
      dbFile.agentUuid = await this.#resolveAgentUuid();
      dbFile.streamUuid = stream?.uuid ?? null;
      dbFile.name = file.name;
    }

    dbFile.mimeType = file.mimeType ?? null;
    dbFile.data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data ?? '');
    dbFile.description = file.description ?? null;
    dbFile.owner = file.owner ?? null;
    dbFile.permanent = file.permanent === true;
    dbFile.active = file.active ?? true;

    if (!current)
    {
      dbFile.eventUuid = file.eventUuid ?? null;
    }
    await dbFile.save(!current);
    return dbFile;
  }

  _toFileRecord(file, size = null)
  {
    return {
      uuid: file.uuid,
      name: file.name,
      mimeType: file.mimeType,
      data: file.data == null ? null : Buffer.from(file.data),
      size: Number(size ?? file.data?.length ?? 0),
      description: file.description,
      owner: file.owner,
      active: file.active === true,
      eventUuid: file.eventUuid ?? null,
      dateCreated: new Date(file.createdAt).getTime(),
      permanent: file.permanent === true,
    };
  }

  _resolveChannelUid(streamId, context = {})
  {
    const source = String(context?.agentInput?.source ?? '').trim();

    if (source)
    {
      return source;
    }

    if (streamId !== Agent.GLOBAL_STREAM_ID)
    {
      const matchingInputs = this.agent.inputs.filter((input) => input.hasStream(streamId));

      if (matchingInputs.length === 1)
      {
        return matchingInputs[0].source;
      }

      if (matchingInputs.length > 1)
      {
        throw new Error(`Channel context is required for ambiguous stream: ${streamId}.`);
      }
    }

    const channelUid = String(context.channelUid ?? '').trim();

    if (!channelUid)
    {
      throw new Error(`Channel context is required for stream: ${streamId}.`);
    }

    return channelUid;
  }

  _resolveStreamId(streamId)
  {
    if (typeof streamId !== 'string' || !streamId.trim())
    {
      throw new Error('streamId is required. Use Agent.GLOBAL_STREAM_ID for global scope.');
    }

    return streamId.trim();
  }

  async #getDbFile(streamId, name, context = {}, { content = false } = {})
  {
    const normalizedStreamId = this._resolveStreamId(streamId);
    const stream = normalizedStreamId === Agent.GLOBAL_STREAM_ID
      ? null
      : await this.#resolveStream(this._resolveChannelUid(normalizedStreamId, context), normalizedStreamId, { create: false });

    if (normalizedStreamId !== Agent.GLOBAL_STREAM_ID && !stream)
    {
      return null;
    }

    const QueryClass = content ? DbQueryAgentFileContent : DbQueryAgentFiles;
    const query = new QueryClass();

    try
    {
      const filter = normalizedStreamId === Agent.GLOBAL_STREAM_ID
        ? '"agent_uuid" = $1 AND "stream_uuid" IS NULL AND "name" = $2 AND "active" = TRUE'
        : '"stream_uuid" = $1 AND "name" = $2 AND "active" = TRUE';
      const filterValue = normalizedStreamId === Agent.GLOBAL_STREAM_ID ? await this.#resolveAgentUuid() : stream.uuid;
      await query.search(filter, [filterValue, name], { limit: 1 });

      if (!(await query.next()))
      {
        return null;
      }

      const file = new AgentFile();
      file.fromRow({
        uuid: query.file.uuid,
        agent_uuid: query.file.agentUuid,
        stream_uuid: query.file.streamUuid,
        event_uuid: query.file.eventUuid,
        name: query.file.name,
        mime_type: query.file.mimeType,
        data: query.file.data,
        description: query.file.description,
        owner: query.file.owner,
        permanent: query.file.permanent,
        active: query.file.active,
        created_at: query.file.createdAt,
        updated_at: query.file.updatedAt,
      });
      return file;
    }
    finally
    {
      query.close();
    }
  }

  async #resolveAgentUuid()
  {
    const agent = new AgentAgent();

    try
    {
      await agent.search('"uid" = $1', [this.agent.agentUid], { limit: 1 });
      await agent.next();
      return agent.uuid;
    }
    finally
    {
      agent.close();
    }
  }

  async #resolveStream(channelUid, streamId, { create = true } = {})
  {
    const query = new DbQueryAgentStream();

    try
    {
      await query.search('"agent_uid" = $1 AND "channel_uid" = $2 AND "stream_id" = $3', [this.agent.agentUid, channelUid, streamId], { limit: 1 });

      if (await query.next())
      {
        const stream = new AgentStream();
        stream.fromRow({
          uuid: query.stream.uuid,
          agent_uuid: query.stream.agentUuid,
          channel_uuid: query.stream.channelUuid,
          stream_id: query.stream.streamId,
          created_at: query.stream.createdAt,
          updated_at: query.stream.updatedAt,
        });
        return stream;
      }
    }
    finally
    {
      query.close();
    }

    if (!create)
    {
      return null;
    }

    const agent = new AgentAgent();
    const channel = new AgentChannel();
    let agentUuid;
    let channelUuid;

    try
    {
      await agent.search('"uid" = $1', [this.agent.agentUid], { limit: 1 });

      if (!(await agent.next()))
      {
        throw new Error(`Unknown agent uid: ${this.agent.agentUid}. Add it with the Agent Smith CLI first.`);
      }

      agentUuid = agent.uuid;
      await channel.search('"uid" = $1', [channelUid], { limit: 1 });

      if (!(await channel.next()))
      {
        throw new Error(`Unknown channel uid: ${channelUid}.`);
      }

      channelUuid = channel.uuid;
    }
    finally
    {
      agent.close();
      channel.close();
    }

    const stream = new AgentStream();
    stream.agentUuid = agentUuid;
    stream.channelUuid = channelUuid;
    stream.streamId = streamId;

    try
    {
      await stream.save(true);
      return stream;
    }
    catch (error)
    {
      const code = String(error?.originalError?.code ?? error?.originalError?.originalError?.code ?? error?.code ?? '');

      if (code !== '23505')
      {
        throw error;
      }

      return await this.#resolveStream(channelUid, streamId, { create: false });
    }
  }

}
