import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { JavaScriptSandboxSkill } from '../src/skills/beta/JavaScriptSandboxSkill.js';

const sandboxJavascriptDirectory = fileURLToPath(new URL('../SandboxJavascript/', import.meta.url));
const skill = new JavaScriptSandboxSkill({ sandboxJavascriptDirectory, timeoutMs: 10000 });

test('JavaScriptSandboxSkill requires an absolute existing sandbox directory', () =>
{
    const validationError = /sandboxJavascriptDirectory is required and must be an absolute path to an existing directory/;

    assert.throws(() => new JavaScriptSandboxSkill(), validationError);
    assert.throws(() => new JavaScriptSandboxSkill({ sandboxJavascriptDirectory: 'SandboxJavascript' }), validationError);
    assert.throws(() => new JavaScriptSandboxSkill({ sandboxJavascriptDirectory: path.join(sandboxJavascriptDirectory, 'missing') }), validationError);
});

test('JavaScriptSandboxSkill checks syntax without executing the source', async () =>
{
    const files = new Map([
        ['valid.js', 'async function main(files) { return "valid"; }'],
        ['invalid.js', 'async function main(files) { return ;'],
    ]);
    const syntaxSkill = new JavaScriptSandboxSkill({
        sandboxJavascriptDirectory,
        tempFileManagerSkill: {
            async temp_file_read({ tempFileName })
            {
                return files.get(tempFileName);
            },
        },
    });

    const validResult = await syntaxSkill.javascript_check_syntax({ fileName: 'valid.js' });
    const invalidResult = await syntaxSkill.javascript_check_syntax({ fileName: 'invalid.js' });

    assert.deepEqual(validResult, {
        ok: true,
        valid: true,
        fileName: 'valid.js',
        requiredJsFiles: [],
        message: 'JavaScript syntax is valid.',
    });
    assert.equal(invalidResult.ok, true);
    assert.equal(invalidResult.valid, false);
    assert.match(invalidResult.error, /Unexpected end|Unexpected token|missing/i);
    assert.equal(invalidResult.sourceFileName, 'invalid.js');
    assert.equal(invalidResult.line, 1);
    assert.equal(invalidResult.sourceLine, 'async function main(files) { return ;');
    assert.match(invalidResult.codeFrame, /> 1 \| async function main/);
});

async function run(code, requiredJsFiles = [], inputFiles = [])
{
    return skill._runCode(code, requiredJsFiles, inputFiles, 10000);
}

test('JavaScriptSandboxSkill loads required and input files in order', async () =>
{
    const result = await run(`
async function main(files)
{
    return JSON.stringify({ order: helper(), inputs: files.map((file) => file.name) });
}
`, [
        { name: 'helper-one.js', data: Buffer.from('const executionOrder = [\'one\'];') },
        { name: 'helper-two.js', data: Buffer.from("executionOrder.push('two'); function helper() { return executionOrder.join(','); }") },
    ], [
        { name: 'allowed.txt', mimeType: 'text/plain', data: Buffer.from('allowed') },
    ]);

    assert.equal(result.ok, true);
    assert.deepEqual(JSON.parse(result.stdout.toString('utf8')), {
        order: 'one,two',
        inputs: ['allowed.txt'],
    });
});

test('JavaScriptSandboxSkill loads canvas from the private sandbox', async () =>
{
    const result = await run(`
async function main()
{
    const { createCanvas } = require('canvas');
    return createCanvas(1, 1).toBuffer('image/png');
}
`);

    assert.equal(result.ok, true, result.stderr);
    assert.deepEqual([...result.stdout.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});

test('JavaScriptSandboxSkill loads bpmn-auto-layout from the private sandbox', async () =>
{
    const result = await run(`
async function main()
{
    const { layoutProcess } = await import('bpmn-auto-layout');
    return typeof layoutProcess;
}
`);

    assert.equal(result.ok, true, result.stderr);
    assert.equal(result.stdout.toString('utf8'), 'function');
});

test('JavaScriptSandboxSkill limits uncaught error output to 4096 characters', async () =>
{
    const result = await run(`
async function main()
{
    throw new Error('x'.repeat(10000));
}
`);

    assert.equal(result.ok, false);
    assert.equal(result.stderr.length, 4096);
    assert.match(result.stderr, /^Error: x+$/);
});

test('JavaScriptSandboxSkill does not decode binary stdout in execution errors', async () =>
{
    const source = `
async function main()
{
    process.stdout.write(Buffer.from([0, 255, 137, 80]));
    throw new Error('render failed');
}
`;
    const executionSkill = new JavaScriptSandboxSkill({
        sandboxJavascriptDirectory,
        tempFileManagerSkill: {
            async temp_file_read()
            {
                return source;
            },
        },
    });

    await assert.rejects(
        executionSkill.javascript_execute({ fileName: 'render.js', inputFileNames: [], outputFileName: 'output.png', outputMimeType: 'image/png', timeoutMs: 10000 }),
        (error) => error.message.includes('render failed') && error.message.includes('stdout: 4 byte(s) omitted') && !error.message.includes('\uFFFD')
    );
});

test('JavaScriptSandboxSkill limits explicit stderr output to 4096 characters', async () =>
{
    const result = await run(`
async function main()
{
    console.error('x'.repeat(10000));
    throw new Error('failed');
}
`);

    assert.equal(result.ok, false);
    assert.equal(result.stderr.length, 4096);
});

test('JavaScriptSandboxSkill denies unauthorized reads, writes, and child processes', async () =>
{
    const projectFile = fileURLToPath(new URL('../src/Agent.js', import.meta.url));
    const readResult = await run(`
async function main()
{
    require('node:fs').readFileSync(${JSON.stringify(projectFile)});
    return 'unexpected';
}
`);
    assert.equal(readResult.ok, false);
    assert.match(`${readResult.stderr}\n${readResult.stdout.toString('utf8')}`, /ERR_ACCESS_DENIED|FileSystemRead|access(?: to this API)? has been restricted/i);

    const writeFile = `denied-write-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`;
    const writeResult = await run(`
async function main()
{
    require('node:fs').writeFileSync(${JSON.stringify(writeFile)}, 'blocked');
    return 'unexpected';
}
`);
    assert.equal(writeResult.ok, false);
    assert.match(`${writeResult.stderr}\n${writeResult.stdout.toString('utf8')}`, /ERR_ACCESS_DENIED|FileSystemWrite|access(?: to this API)? has been restricted/i);

    const childProcessResult = await run(`
async function main()
{
    require('node:child_process').spawnSync(process.execPath, ['-e', '']);
    return 'unexpected';
}
`);
    assert.equal(childProcessResult.ok, false);
    assert.match(`${childProcessResult.stderr}\n${childProcessResult.stdout.toString('utf8')}`, /ERR_ACCESS_DENIED|ChildProcess|access(?: to this API)? has been restricted/i);
});