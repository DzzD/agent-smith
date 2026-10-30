/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import JSZip from 'jszip';

import { AgentSkill } from '../../AgentSkill.js';
import { AgentUtils } from '../../AgentUtils.js';

export class ZipSkill extends AgentSkill
{
  constructor({ tempFileManagerSkill = null } = {})
  {
    super();

    this.description = 'Provides functions to extract ZIP archives stored in TempFileManagerSkill.';
    this._tempFileManagerSkill = tempFileManagerSkill;

    this.tools = [
      {
        type: 'function',
        name: 'zip_extract',
        description: 'Extracts every file from a ZIP stored in TempFileManagerSkill and returns the created file list.',
        parameters: {
          type: 'object',
          properties: {
            sourceTempFileName: {
              type: 'string',
              description: 'Existing ZIP file stored in TempFileManagerSkill.',
            },
            outputDirectory: {
              type: 'string',
              description: 'Output directory where extracted files are written (for example: extracted/docs).',
            },
            overwriteExisting: {
              anyOf: [
                { type: 'boolean' },
                { type: 'null' },
              ],
              description: 'Set to false to keep existing temp files and append suffixes. Defaults to true.',
            },
          },
          required: ['sourceTempFileName', 'outputDirectory'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'zip_create',
        description: 'Creates a ZIP archive from multiple temp files selected by list and/or wildcard pattern.',
        parameters: {
          type: 'object',
          properties: {
            outputTempFileName: {
              type: 'string',
              description: 'Output ZIP temp file name (must end with .zip).',
            },
            sourceTempFileNames: {
              anyOf: [
                {
                  type: 'array',
                  items: { type: 'string' },
                },
                { type: 'null' },
              ],
              description: 'Optional explicit list of temp files to include.',
            },
            sourceTempFilePattern: {
              anyOf: [
                { type: 'string' },
                { type: 'null' },
              ],
              description: 'Optional wildcard pattern to select files, for example: folder/* or folder/*.txt.',
            },
            overwriteExisting: {
              anyOf: [
                { type: 'boolean' },
                { type: 'null' },
              ],
              description: 'Set to false to fail if outputTempFileName already exists. Defaults to true.',
            },
          },
          required: ['outputTempFileName'],
          additionalProperties: false,
        },
      },
    ];
  }

  get usage()
  {
    return `
Rules:
- Provide sourceTempFileName referencing a ZIP file already stored in TempFileManagerSkill.
- outputDirectory is mandatory: all extracted files are written below this directory.
- Every regular entry becomes a temp file using the ZIP path form dirName/nameOfFile (subdirectories preserved).
- Existing temp files are overwritten unless overwriteExisting is set to false; when false, a -copyN suffix keeps names unique.
- The tool returns the ordered list of created files. Always use the returned tempFileName to read an extracted file.
- Directory entries and macOS metadata files such as __MACOSX or .DS_Store are ignored.

- zip_create can include files from sourceTempFileNames and/or sourceTempFilePattern.
- sourceTempFilePattern supports wildcard with * and ?, for example assets/* or assets/*.json.
- At least one source must be provided (list and/or pattern).
- outputTempFileName must end with .zip.
`;
  }

  getHumanReadableToolAction(toolName, args = {})
  {
    const toolNameReadable = {
      zip_extract: '📤 extracting archive',
      zip_create: '📦 creating archive',
    }[toolName];

    if (toolNameReadable == null)
    {
      return super.getHumanReadableToolAction(toolName, args);
    }

    let toolArgsReadable = '';

    switch (toolName)
    {
      case 'zip_extract':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args.sourceTempFileName, 64);
        break;
      }

      case 'zip_create':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args.outputTempFileName, 64);
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

  async zip_extract({ sourceTempFileName, outputDirectory, overwriteExisting = null }, context = {})
  {
    const tempFileManager = this.tempFileManagerSkill;

    if (!tempFileManager)
    {
      throw new Error('TempFileManagerSkill is required to extract ZIP archives.');
    }

    const normalizedSource = AgentUtils.normalizeRequiredString(sourceTempFileName, 'sourceTempFileName');
    const normalizedOutputDirectory = this.#normalizeOutputDirectory(outputDirectory);
    const zipFile = await tempFileManager._getFile(normalizedSource, context.streamId, true, context);
    const buffer = zipFile?.data;

    if (!Buffer.isBuffer(buffer) || buffer.length === 0)
    {
      throw new Error(`ZIP file "${normalizedSource}" is empty or unavailable.`);
    }

    const archive = await this.#loadArchive(buffer, normalizedSource);
    const allowOverwrite = overwriteExisting !== false;

    const createdFiles = [];
    const seenNames = new Set();

    for (const entryName of Object.keys(archive.files))
    {
      const entry = archive.files[entryName];

      if (!entry || entry.dir)
      {
        continue;
      }

      const segments = this.#sanitizeEntrySegments(entry.name);

      if (!segments.length)
      {
        continue;
      }

      const fileName = segments[segments.length - 1];

      if (fileName === '.DS_Store')
      {
        continue;
      }

      const normalizedPath = segments.join('/');
      const outputPath = `${normalizedOutputDirectory}/${normalizedPath}`;
      const reservedName = await this.#reserveTempFileName({
        preferredName: outputPath,
        allowOverwrite,
        tempFileManager,
        seenNames,
        streamId: context.streamId,
        context,
      });

      const fileBuffer = await entry.async('nodebuffer');
      const mimeType = this.#guessMimeType(reservedName, fileBuffer);

      if (allowOverwrite)
      {
        if ((await tempFileManager.getFiles(context.streamId, context)).has(reservedName))
        {
          await tempFileManager.temp_file_remove({ tempFileName: reservedName }, context);
        }
      }

      await tempFileManager.createFile({
        streamId: context.streamId,
        tempFileName: reservedName,
        mimeType,
        description: null,
        owner: null,
        permanent: false,
        data: fileBuffer,
      }, context);

      createdFiles.push({
        tempFileName: reservedName,
        originalPath: normalizedPath,
        mimeType,
        size: fileBuffer.length,
      });
    }

    return {
      sourceTempFileName: normalizedSource,
      outputDirectory: normalizedOutputDirectory,
      count: createdFiles.length,
      files: createdFiles,
    };
  }

  async zip_create({
    outputTempFileName,
    sourceTempFileNames = null,
    sourceTempFilePattern = null,
    overwriteExisting = null,
  }, context = {})
  {
    const tempFileManager = this.tempFileManagerSkill;

    if (!tempFileManager)
    {
      throw new Error('TempFileManagerSkill is required to create ZIP archives.');
    }

    const normalizedOutputTempFileName = AgentUtils.normalizeRequiredString(outputTempFileName, 'outputTempFileName');

    if (!normalizedOutputTempFileName.toLowerCase().endsWith('.zip'))
    {
      throw new Error('outputTempFileName must end with .zip');
    }

    const resolvedInputFileNames = (await this.#resolveSourceTempFileNames({
      sourceTempFileNames,
      sourceTempFilePattern,
      tempFileManager,
      streamId: context.streamId,
      context,
    })).filter((tempFileName) => tempFileName !== normalizedOutputTempFileName);

    if (!resolvedInputFileNames.length)
    {
      throw new Error('No input files selected for ZIP creation.');
    }

    const archive = new JSZip();
    const includedFiles = [];

    for (const inputTempFileName of resolvedInputFileNames)
    {
      const sourceFile = await tempFileManager._getFile(inputTempFileName, context.streamId, true, context);

      if (!sourceFile || !Buffer.isBuffer(sourceFile.data))
      {
        continue;
      }

      archive.file(inputTempFileName, sourceFile.data);
      includedFiles.push({
        tempFileName: inputTempFileName,
        mimeType: sourceFile.mimeType,
        size: sourceFile.data.length,
      });
    }

    if (!includedFiles.length)
    {
      throw new Error('No readable input files were found for ZIP creation.');
    }

    const zipBuffer = await archive.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 9,
      },
    });

    const allowOverwrite = overwriteExisting !== false;

    if ((await tempFileManager.getFiles(context.streamId, context)).has(normalizedOutputTempFileName))
    {
      if (!allowOverwrite)
      {
        throw new Error(`File already exists: ${normalizedOutputTempFileName}`);
      }

      await tempFileManager.temp_file_remove({ tempFileName: normalizedOutputTempFileName }, context);
    }

    await tempFileManager.createFile({
      streamId: context.streamId,
      tempFileName: normalizedOutputTempFileName,
      mimeType: 'application/zip',
      description: null,
      owner: null,
      permanent: false,
      data: zipBuffer,
    }, context);

    return {
      outputTempFileName: normalizedOutputTempFileName,
      count: includedFiles.length,
      files: includedFiles,
      size: zipBuffer.length,
    };
  }

  async #loadArchive(buffer, sourceTempFileName)
  {
    try
    {
      return await JSZip.loadAsync(buffer);
    }
    catch (error)
    {
      throw new Error(
        `Failed to parse ZIP "${sourceTempFileName}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  #sanitizeEntrySegments(entryName)
  {
    const normalized = String(entryName ?? '');

    const segments = normalized
      .replace(/\\/g, '/')
      .split('/')
      .map((segment) => segment.trim())
      .filter((segment) => segment && segment !== '.' && segment !== '..')
      .map((segment) => AgentUtils.sanitizeFileName(segment));

    if (segments[0] === '__MACOSX')
    {
      return [];
    }

    return segments;
  }

  #normalizeOutputDirectory(outputDirectory)
  {
    const normalized = AgentUtils.normalizeRequiredString(outputDirectory, 'outputDirectory');
    const segments = normalized
      .replace(/\\/g, '/')
      .split('/')
      .map((segment) => segment.trim())
      .filter((segment) => segment && segment !== '.' && segment !== '..')
      .map((segment) => AgentUtils.sanitizeFileName(segment))
      .filter(Boolean);

    if (!segments.length)
    {
      throw new Error('outputDirectory must contain at least one valid path segment');
    }

    return segments.join('/');
  }

  async #resolveSourceTempFileNames({ sourceTempFileNames, sourceTempFilePattern, tempFileManager, streamId, context })
  {
    const names = [];

    if (sourceTempFileNames != null)
    {
      if (!Array.isArray(sourceTempFileNames))
      {
        throw new Error('sourceTempFileNames must be an array when provided');
      }

      for (const rawName of sourceTempFileNames)
      {
        const normalizedName = AgentUtils.normalizeRequiredString(rawName, 'sourceTempFileNames[]');
        names.push(normalizedName);
      }
    }

    if (sourceTempFilePattern != null)
    {
      const patternMatches = await this.#matchTempFilePattern({
        pattern: sourceTempFilePattern,
        tempFileManager,
        streamId,
        context,
      });

      names.push(...patternMatches);
    }

    if (!names.length)
    {
      throw new Error('Provide sourceTempFileNames and/or sourceTempFilePattern');
    }

    return [...new Set(names)];
  }

  async #matchTempFilePattern({ pattern, tempFileManager, streamId, context })
  {
    const normalizedPattern = AgentUtils.normalizeRequiredString(pattern, 'sourceTempFilePattern');
    const regex = this.#wildcardToRegex(normalizedPattern);

    const readableFiles = await tempFileManager._getReadableFiles(streamId, context);

    return [...readableFiles.keys()]
      .filter((tempFileName) => regex.test(tempFileName))
      .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
  }

  #wildcardToRegex(pattern)
  {
    let output = '^';

    for (const char of pattern)
    {
      if (char === '*')
      {
        output += '.*';
        continue;
      }

      if (char === '?')
      {
        output += '.';
        continue;
      }

      output += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    }

    output += '$';

    return new RegExp(output);
  }

  async #reserveTempFileName({ preferredName, allowOverwrite, tempFileManager, seenNames, streamId, context })
  {
    if (!seenNames.has(preferredName))
    {
      if (allowOverwrite || !(await tempFileManager.getFiles(streamId, context)).has(preferredName))
      {
        seenNames.add(preferredName);
        return preferredName;
      }
    }

    return await this.#buildCopyName(preferredName, tempFileManager, seenNames, streamId, context);
  }

  async #buildCopyName(preferredName, tempFileManager, seenNames, streamId, context)
  {
    const lastSlashIndex = preferredName.lastIndexOf('/');
    const directory = lastSlashIndex === -1 ? '' : `${preferredName.slice(0, lastSlashIndex + 1)}`;
    const fileName = lastSlashIndex === -1 ? preferredName : preferredName.slice(lastSlashIndex + 1);
    const match = fileName.match(/(\.[^./\\]+)$/);

    const extension = match ? match[0] : '';
    const base = match ? fileName.slice(0, -match[0].length) : fileName;

    let counter = 1;

    while (counter < 1000)
    {
      const candidate = `${directory}${base || 'file'}-copy${counter}${extension}`;

      if (!seenNames.has(candidate) && !(await tempFileManager.getFiles(streamId, context)).has(candidate))
      {
        seenNames.add(candidate);
        return candidate;
      }

      counter += 1;
    }

    throw new Error(`Unable to allocate a unique file name for ${preferredName}`);
  }

  #guessMimeType(tempFileName, buffer)
  {
    return AgentUtils.guessMimeTypeFromFileName(tempFileName, {
      isBinary: this.#isBinaryBuffer(buffer),
    });
  }

  #isBinaryBuffer(buffer)
  {
    if (!buffer || buffer.length === 0)
    {
      return false;
    }

    const sampleLength = Math.min(buffer.length, 512);
    let binaryCount = 0;

    for (let index = 0; index < sampleLength; index += 1)
    {
      const byte = buffer[index];

      if (byte === 9 || byte === 10 || byte === 13)
      {
        continue;
      }

      if (byte >= 32 && byte <= 126)
      {
        continue;
      }

      binaryCount += 1;

      if (binaryCount > sampleLength * 0.1)
      {
        return true;
      }
    }

    return false;
  }
}
