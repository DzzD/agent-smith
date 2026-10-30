/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { AgentSkill } from '../../AgentSkill.js';
import { AgentUtils } from '../../AgentUtils.js';

export class JavascriptSandbox extends AgentSkill
{
  constructor({
    sandboxJavascriptDirectory,
    timeoutMs = 10000,
    maxOutputLength = 1024*1024*4,
    tempFileManagerSkill = null,
  } = {})
  {
    super();

    if (!sandboxJavascriptDirectory || !path.isAbsolute(sandboxJavascriptDirectory) || !fs.existsSync(sandboxJavascriptDirectory) || !fs.statSync(sandboxJavascriptDirectory).isDirectory())
    {
      throw new Error('sandboxJavascriptDirectory is required and must be an absolute path to an existing directory.');
    }

    this.sandboxJavascriptDirectory = sandboxJavascriptDirectory;
    this.timeoutMs = timeoutMs;
    this.maxOutputLength = maxOutputLength;
    this._tempFileManagerSkill = tempFileManagerSkill;
    this.description = `
Executes isolated JavaScript and writes generated results to temporary files.
Can be used to:
- Generate images, charts, graphs, diagrams, and other visualizations using Canvas.
- Draw shapes, text, icons, sprites, and custom graphics.
- Compose, transform, resize, crop, or annotate images.
- Generate data-driven visual assets such as dashboards, plots, heatmaps, and infographics.
- Convert or transform files and structured data, e.g. CSV to JSON.
- Generate text-based or binary files programmatically.
`.trim();

    this.tools = [
      {
        type: 'function',
        name: 'javascript_check_syntax',
        allowRepeat: true,
        description: 'Checks the JavaScript syntax of a temporary source file without executing it. Optional required JavaScript files are checked together with the main source in the same scope.',
        parameters: {
          type: 'object',
          properties: {
            fileName: {
              type: 'string',
              description: 'Temporary in-memory file containing the JavaScript source code to check.',
            },
            requiredJsFiles: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Optional temporary JavaScript source files loaded before the main source. Use the same files that will be passed to javascript_execute.',
            },
          },
          required: ['fileName'],
          additionalProperties: false,
        },
      },
      {
        type: 'function',
        name: 'javascript_execute',
        allowRepeat: true,
        description: 'Executes JavaScript code created using TempFileManagerSkill. Optional required JavaScript files are loaded before the main script. The script receives input files through main(files) and its return value is written to outputFileName.',
        parameters: {
          type: 'object',
          properties: {
            fileName: {
              type: 'string',
              description: 'Temporary in-memory file containing the JavaScript source code.',
            },
            requiredJsFiles: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Optional temporary JavaScript source files loaded in array order before the main script. Use them for shared functions, classes, constants, or helpers.',
            },
            inputFileNames: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Optional temporary input files passed to main(files).',
            },
            outputFileName: {
              type: 'string',
              description: 'Temporary in-memory file automatically created from the value returned by main(files).',
            },
            outputMimeType: {
              type: 'string',
              description: 'Mime type for outputFileName.',
            },
            timeoutMs: {
              type: 'integer',
              minimum: 1,
              description: 'Execution timeout in milliseconds.',
            },
          },
          required: ['fileName', 'outputFileName', 'outputMimeType', 'timeoutMs'],
          additionalProperties: false,
        },
      },
    ];
  }

  get usage()
  {
    return `
Purpose:
- Execute isolated JavaScript to transform optional input files into one temporary output file.
- The script must define: async function main(files)
- javascript_execute calls main(files) and stores its return value as outputFileName.
- Optional requiredJsFiles are JavaScript source files loaded in array order before the main script.

Rules:
- Use javascript_check_syntax before javascript_execute to validate the source and its requiredJsFiles without executing them.
- Create and write the .js script with TempFileManagerSkill first.
- Define exactly one entry point: async function main(files)
- Do not call main() yourself.
- Do not write the result to stdout. Return it from main(files).
- Use requiredJsFiles when the main script depends on functions, classes, constants, or helpers defined in other temporary JavaScript files.
- requiredJsFiles are loaded in array order before the main script and share the same execution scope.
- requiredJsFiles must not define or call main().
- files is always an array.
- Each file contains: name, mimeType, data.
- file.data is a Node.js Buffer containing the raw file content.
- Return a Buffer for binary output.
- Return a string for text output.
- Node.js only. No fs, network, or browser APIs.
- For image generation or editing, use: const { createCanvas, loadImage } = require('canvas');
- For graph and technical image generation, use a sufficiently large image size; 1024×768 is a good starting point.

Examples:

async function main(files)
{
  return 'hello';
}

async function main(files)
{
  const { createCanvas } = require('canvas');

  const canvas = createCanvas(1024, 768);
  const ctx = canvas.getContext('2d');

  ctx.fillRect(20, 20, 216, 216);

  return canvas.toBuffer('image/png');
}

async function main(files)
{
  const { createCanvas, loadImage } = require('canvas');

  const image = await loadImage(files[0].data);

  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');

  ctx.drawImage(image, 0, 0);
  ctx.fillRect(10, 10, 100, 100);

  return canvas.toBuffer('image/png');
}
`;
  }

  getHumanReadableToolAction(toolName, args = {})
  {
    const toolNameReadable = {
      javascript_check_syntax: '✅ checking syntax of',
      javascript_execute: '▶️ executing',
    }[toolName];

    if (toolNameReadable == null)
    {
      return super.getHumanReadableToolAction(toolName, args);
    }

    let toolArgsReadable = '';

    switch (toolName)
    {
      case 'javascript_check_syntax':
      case 'javascript_execute':
      {
        toolArgsReadable = AgentUtils.stringStrimLeft(args.fileName, 64);
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

  async javascript_check_syntax(args, context = {})
  {
    const tempFileManager =
      this._tempFileManagerSkill ??
      this.agent.skills.get('TempFileManagerSkill');

    if (!tempFileManager)
    {
      throw new Error(
        'TempFileManagerSkill is required to check JavaScript files.'
      );
    }

    const readSource = async tempFileName => await tempFileManager.temp_file_read({
      tempFileName,
      encoding: 'utf8',
      startLine: null,
      endLine: null,
      applyLimit: false,
    }, {
      streamId: context.streamId,
    });

    const sourceCode = await readSource(args.fileName);
    const requiredJsFileNames = Array.isArray(args.requiredJsFiles)
      ? args.requiredJsFiles
      : [];
    const requiredJsFiles = await Promise.all(
      requiredJsFileNames.map(async requiredJsFileName => ({
        name: requiredJsFileName,
        code: await readSource(requiredJsFileName),
      }))
    );
    const sourceFiles = [...requiredJsFiles, { name: args.fileName, code: sourceCode }];
    const sourceSections = [];
    const wrappedLines = ['(async function(require)', '{'];

    for (const sourceFile of sourceFiles)
    {
      const lines = sourceFile.code.split('\n');
      wrappedLines.push('', `// source: ${sourceFile.name}`);
      const startLine = wrappedLines.length + 1;
      wrappedLines.push(...lines);
      sourceSections.push({
        fileName: sourceFile.name,
        startLine,
        endLine: startLine + lines.length - 1,
        lines,
      });
    }

    const syntaxCheckFileName = 'javascript-syntax-check.js';
    wrappedLines.push('', '})');
    const wrappedSource = wrappedLines.join('\n');

    try
    {
      new vm.Script(wrappedSource, { filename: syntaxCheckFileName });

      return {
        ok: true,
        valid: true,
        fileName: args.fileName,
        requiredJsFiles: requiredJsFileNames,
        message: 'JavaScript syntax is valid.',
      };
    }
    catch (error)
    {
      const stack = error instanceof Error ? String(error.stack ?? '') : '';
      const locationMatch = stack.match(new RegExp(`^${syntaxCheckFileName}:(\\d+)(?::(\\d+))?`, 'm'));
      const generatedLine = locationMatch ? Number(locationMatch[1]) : null;
      const generatedColumn = locationMatch?.[2] ? Number(locationMatch[2]) : null;
      let sourceSection = generatedLine === null
        ? null
        : sourceSections.find((section) => generatedLine >= section.startLine && generatedLine <= section.endLine);

      if (!sourceSection && generatedLine !== null)
      {
        sourceSection = [...sourceSections].reverse().find((section) => section.endLine < generatedLine) ?? null;
      }

      const line = sourceSection
        ? Math.min(sourceSection.lines.length, generatedLine - sourceSection.startLine + 1)
        : generatedLine;
      const sourceLine = sourceSection && line !== null ? sourceSection.lines[line - 1] ?? '' : null;
      const column = generatedColumn ?? (sourceLine === null ? null : this._resolveSyntaxErrorColumn(stack, sourceLine));

      return {
        ok: true,
        valid: false,
        fileName: args.fileName,
        requiredJsFiles: requiredJsFileNames,
        error: error instanceof Error ? error.message : String(error),
        sourceFileName: sourceSection?.fileName ?? null,
        line,
        column,
        sourceLine,
        codeFrame: this._buildSyntaxCodeFrame(sourceSection?.lines ?? [], line, column),
      };
    }
  }

  _resolveSyntaxErrorColumn(stack, sourceLine)
  {
    const stackLines = stack.split('\n');
    const sourceLineIndex = stackLines.findIndex((line) => line === sourceLine);
    const caretLine = sourceLineIndex >= 0 ? stackLines[sourceLineIndex + 1] ?? '' : '';
    const caretIndex = caretLine.indexOf('^');
    return caretIndex >= 0 ? caretIndex + 1 : null;
  }

  _buildSyntaxCodeFrame(lines, line, column)
  {
    if (!Number.isInteger(line) || line < 1 || lines.length === 0)
    {
      return null;
    }

    const startLine = Math.max(1, line - 2);
    const endLine = Math.min(lines.length, line + 2);
    const lineNumberWidth = String(endLine).length;
    const frame = [];

    for (let currentLine = startLine; currentLine <= endLine; currentLine++)
    {
      const marker = currentLine === line ? '>' : ' ';
      frame.push(`${marker} ${String(currentLine).padStart(lineNumberWidth)} | ${lines[currentLine - 1]}`);

      if (currentLine === line && Number.isInteger(column) && column > 0)
      {
        frame.push(`  ${' '.repeat(lineNumberWidth)} | ${' '.repeat(column - 1)}^`);
      }
    }

    return frame.join('\n');
  }

  _buildInputPayloadHeader(codeBuffer, requiredJsFiles, inputFiles)
  {
    return {
      codeLength: codeBuffer.length,
      requiredJsFiles: requiredJsFiles.map(file => ({
        name: file.name,
        size: file.data.length,
      })),
      inputFiles: inputFiles.map(file => ({
        name: file.name,
        mimeType: file.mimeType,
        size: file.data.length,
      })),
    };
  }

  _getBootstrapCode()
  {
    return `
(async () =>
{
  const chunks = [];

  for await (const chunk of process.stdin)
  {
    chunks.push(chunk);
  }

  const payload = Buffer.concat(chunks);

  if (payload.length < 4)
  {
    throw new Error('Invalid JavascriptSandbox input payload.');
  }

  let offset = 0;

  const headerLength = payload.readUInt32BE(offset);
  offset += 4;

  if (offset + headerLength > payload.length)
  {
    throw new Error('Invalid JavascriptSandbox header.');
  }

  const header = JSON.parse(
    payload.subarray(offset, offset + headerLength).toString('utf8')
  );

  offset += headerLength;

  if (!Number.isInteger(header.codeLength) || header.codeLength < 0)
  {
    throw new Error('Invalid JavascriptSandbox code length.');
  }

  if (offset + header.codeLength > payload.length)
  {
    throw new Error('Invalid JavascriptSandbox code payload.');
  }

  const code = payload
    .subarray(offset, offset + header.codeLength)
    .toString('utf8');

  offset += header.codeLength;

  const requiredJsFiles = [];

  for (const fileInfo of header.requiredJsFiles ?? [])
  {
    if (!Number.isInteger(fileInfo.size) || fileInfo.size < 0)
    {
      throw new Error(
        'Invalid JavascriptSandbox required JavaScript file size: ' + fileInfo.name
      );
    }

    if (offset + fileInfo.size > payload.length)
    {
      throw new Error(
        'Invalid JavascriptSandbox required JavaScript file payload: ' + fileInfo.name
      );
    }

    requiredJsFiles.push({
      name: fileInfo.name,
      code: payload
        .subarray(offset, offset + fileInfo.size)
        .toString('utf8'),
    });

    offset += fileInfo.size;
  }

  const files = [];

  for (const fileInfo of header.inputFiles ?? [])
  {
    if (!Number.isInteger(fileInfo.size) || fileInfo.size < 0)
    {
      throw new Error(
        'Invalid JavascriptSandbox input file size: ' + fileInfo.name
      );
    }

    if (offset + fileInfo.size > payload.length)
    {
      throw new Error(
        'Invalid JavascriptSandbox input file payload: ' + fileInfo.name
      );
    }

    files.push({
      name: fileInfo.name,
      mimeType: fileInfo.mimeType,
      data: payload.subarray(offset, offset + fileInfo.size),
    });

    offset += fileInfo.size;
  }

  if (offset !== payload.length)
  {
    throw new Error('Unexpected data at end of JavascriptSandbox payload.');
  }

  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

  const requiredCode = requiredJsFiles
    .map(file => '\\n// required: ' + file.name + '\\n' + file.code + '\\n')
    .join('\\n');

  const loadMain = new AsyncFunction(
    'require',
    requiredCode + '\\n' + code + \`
\\n
if (typeof main !== 'function')
{
  throw new Error('JavaScript script must define async function main(files).');
}

return main;
\`
  );

  const main = await loadMain(require);
  const result = await main(files);

  if (Buffer.isBuffer(result))
  {
    process.stdout.write(result);
    return;
  }

  if (result instanceof Uint8Array)
  {
    process.stdout.write(Buffer.from(result));
    return;
  }

  if (typeof result === 'string')
  {
    process.stdout.write(result);
    return;
  }

  throw new Error(
    'main(files) must return a string, Buffer, or Uint8Array.'
  );
})().catch(error =>
{
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
`;
  }

  async _runCode(code, requiredJsFiles, inputFiles, timeoutMs)
  {
    const [major, minor] = process.versions.node.split('.').map(Number);
    const stablePermission = major > 22 || (major === 22 && minor >= 13);

    const permissionFlag = stablePermission
      ? '--permission'
      : '--experimental-permission';

    const args = [
      permissionFlag,
      '--no-warnings',
      '--input-type=commonjs',
      `--allow-fs-read=${this.sandboxJavascriptDirectory}`,
      '--allow-addons',
      '-e',
      this._getBootstrapCode(),
    ];

    // if (stablePermission)
    // {
    //   args.push('--allow-net');
    // }

    const child = spawn(process.execPath, args, {
      cwd: this.sandboxJavascriptDirectory,
      env: {},
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const stdoutChunks = [];
    let stdoutLength = 0;

    let stderr = '';
    let stderrLength = 0;

    let timedOut = false;
    let outputLimitReached = false;

    const checkOutputLimit = () =>
    {
      if (stdoutLength + stderrLength <= this.maxOutputLength)
      {
        return;
      }

      outputLimitReached = true;
      child.kill('SIGKILL');
    };

    child.stdout.on('data', chunk =>
    {
      stdoutChunks.push(chunk);
      stdoutLength += chunk.length;

      checkOutputLimit();
    });

    child.stderr.on('data', chunk =>
    {
      stderr += chunk.toString();
      stderrLength += chunk.length;

      checkOutputLimit();
    });

    child.stdin.on('error', error =>
    {
      if (error.code !== 'EPIPE')
      {
        stderr += error.stack ?? error.message ?? String(error);
      }
    });

    const timer = setTimeout(() =>
    {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    const codeBuffer = Buffer.from(code, 'utf8');

    const header = this._buildInputPayloadHeader(
      codeBuffer,
      requiredJsFiles,
      inputFiles,
    );

    const headerBuffer = Buffer.from(
      JSON.stringify(header),
      'utf8',
    );

    const headerLengthBuffer = Buffer.allocUnsafe(4);
    headerLengthBuffer.writeUInt32BE(headerBuffer.length);

    child.stdin.write(headerLengthBuffer);
    child.stdin.write(headerBuffer);
    child.stdin.write(codeBuffer);

    for (const requiredJsFile of requiredJsFiles)
    {
      child.stdin.write(requiredJsFile.data);
    }

    for (const inputFile of inputFiles)
    {
      child.stdin.write(inputFile.data);
    }

    child.stdin.end();

    const exitCode = await new Promise(resolve =>
    {
      child.on('close', resolve);
    });

    clearTimeout(timer);

    const stdout = Buffer.concat(
      stdoutChunks,
      stdoutLength,
    );

    return {
      ok: exitCode === 0 && !timedOut && !outputLimitReached,
      exitCode,
      timedOut,
      outputLimitReached,
      stdout: stdout.subarray(0, this.maxOutputLength),
      stderr: stderr.slice(0, this.maxOutputLength),
    };
  }

  async javascript_execute(args, context = {})
  {
    const tempFileManager =
      this._tempFileManagerSkill ??
      this.agent.skills.get('TempFileManagerSkill');

    if (!tempFileManager)
    {
      throw new Error(
        'TempFileManagerSkill is required to execute JavaScript files.'
      );
    }

    const code = await tempFileManager.temp_file_read({
      tempFileName: args.fileName,
      encoding: 'utf8',
      startLine: null,
      endLine: null,
      applyLimit: false,
    }, {
      streamId: context.streamId,
    });

    const forbiddenPatterns = [
      /\brequire\s*\(\s*['"]fs['"]\s*\)/,
      /\brequire\s*\(\s*['"]node:fs['"]\s*\)/,
      /\brequire\s*\(\s*['"]fs\/promises['"]\s*\)/,
      /\brequire\s*\(\s*['"]node:fs\/promises['"]\s*\)/,
      /\bimport\s+.*\s+from\s+['"]fs['"]/,
      /\bimport\s+.*\s+from\s+['"]node:fs['"]/,
      /\bimport\s+.*\s+from\s+['"]fs\/promises['"]/,
      /\bimport\s+.*\s+from\s+['"]node:fs\/promises['"]/,
      /\bfs\./,
      /\bwriteFileSync\b/,
      /\bwriteFile\b/,
      /\bappendFileSync\b/,
      /\bappendFile\b/,
      /\bcreateWriteStream\b/,
    ];

    const assertAllowedCode = (sourceCode, sourceName) =>
    {
      for (const pattern of forbiddenPatterns)
      {
        if (pattern.test(sourceCode))
        {
          throw new Error(
            `JavaScript code in ${sourceName} must not use fs or write files directly. Return the result from main(files). javascript_execute creates outputFileName automatically.`
          );
        }
      }
    };

    assertAllowedCode(code, args.fileName);

    const requiredJsFileNames = Array.isArray(args.requiredJsFiles)
      ? args.requiredJsFiles
      : [];

    const requiredJsFiles = await Promise.all(
      requiredJsFileNames.map(async requiredJsFileName =>
      {
        const requiredCode = await tempFileManager.temp_file_read({
          tempFileName: requiredJsFileName,
          encoding: 'utf8',
          startLine: null,
          endLine: null,
          applyLimit: false,
        }, {
          streamId: context.streamId,
        });

        assertAllowedCode(requiredCode, requiredJsFileName);

        return {
          name: requiredJsFileName,
          data: Buffer.from(requiredCode, 'utf8'),
        };
      })
    );

    const inputFileNames = Array.isArray(args.inputFileNames)
      ? args.inputFileNames
      : [];

    const inputFiles = await Promise.all(inputFileNames.map(async inputFileName =>
    {
      const inputFile = await tempFileManager._getFile(
        inputFileName,
        context.streamId,
        true,
        context,
      );

      return {
        name: inputFileName,
        mimeType: inputFile.mimeType,
        data: inputFile.data,
      };
    }));

    const timeoutMs = Number.isFinite(args.timeoutMs)
      ? args.timeoutMs
      : this.timeoutMs;

    const result = await this._runCode(
      code,
      requiredJsFiles,
      inputFiles,
      timeoutMs,
    );

    if (!result.ok)
    {
      const parts = [];

      if (result.timedOut)
      {
        parts.push(
          `JavaScript execution timed out after ${timeoutMs} ms`
        );
      }

      if (result.outputLimitReached)
      {
        parts.push(
          'JavaScript execution output limit reached'
        );
      }

      if (Number.isInteger(result.exitCode))
      {
        parts.push(
          `JavaScript execution failed with exit code ${result.exitCode}`
        );
      }

      if (result.stderr)
      {
        parts.push(result.stderr);
      }

      if (result.stdout.length)
      {
        parts.push(
          `stdout:\n${result.stdout.toString('utf8')}`
        );
      }

      throw new Error(parts.join('\n\n'));
    }

    if (!result.stdout.length)
    {
      throw new Error(
        'JavaScript main(files) returned an empty result.'
      );
    }

    const outputFileName = args.outputFileName.trim();
    const outputMimeType = args.outputMimeType.trim();

    if ((await tempFileManager.getFiles(context.streamId, context)).has(outputFileName))
    {
      await tempFileManager.temp_file_remove({
        tempFileName: outputFileName,
      }, context);
    }

    await tempFileManager.temp_file_create({
      tempFileName: outputFileName,
      mimeType: outputMimeType,
    }, context);

    await tempFileManager.appendBuffer({
      tempFileName: outputFileName,
      data: result.stdout,
    }, context);

    const file = await tempFileManager._getFile(
      outputFileName,
      context.streamId,
      false,
      context,
    );

    return {
      outputFileName,
      mimeType: file.mimeType,
      size: file.data.length,
    };
  }
}