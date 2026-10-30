import assert from 'node:assert/strict';
import test from 'node:test';
import { Agent } from '../src/Agent.js';
import { AgentUtils } from '../src/AgentUtils.js';
import { McpSkill } from '../src/skills/ext/McpSkill.js';
import { RagSkill } from '../src/skills/ext/RagSkill.js';

test('Agent initializes a permanent MCP skill for each active stream', async () =>
{
  const agent = new Agent();
  const skill = new RagSkill({ url: 'http://127.0.0.1:3100/mcp', bearer: 'test-bearer' });
  const loadedStreams = [];
  skill.load = async ({ streamId }) =>
  {
    loadedStreams.push(streamId);
    skill.streamStates.set(streamId, {
      negotiatedProtocolVersion: '2025-11-25',
      tools: [{ name: 'document_search', parameters: { type: 'object', properties: {}, required: [] } }],
      toolNameMap: new Map([['document_search', 'document_search']]),
    });
  };
  agent.registerSkill(skill);
  const agentInput = { buildStreamPrompt() { return ''; } };

  const context = await agent.getContext('stream-1', [], agentInput);

  assert.deepEqual(loadedStreams, ['stream-1']);
  assert.equal(context.systemPrompt.includes('<function>document_search</function>'), true);
  assert.equal(agent.buildModelTools(context.loadedSkillNames, 'stream-1').some((tool) => tool.function.name === 'document_search'), true);
});

test('Agent does not initialize a loadOnDemand MCP skill before it is loaded', async () =>
{
  const agent = new Agent();
  const skill = new McpSkill({ name: 'TestMcpSkill', endpoint: 'http://127.0.0.1:3100/mcp' });
  let loadAttempts = 0;

  skill.load = async () =>
  {
    loadAttempts += 1;
  };

  agent.registerSkill(skill, { loadOnDemand: true });
  agent.eventManager = { load: async () => {}, getConversationMessages: () => [] };
  agent.createEventManager = () => agent.eventManager;

  await agent.start();
  await agent.getContext('stream-1', [], { buildStreamPrompt() { return ''; } });

  assert.equal(loadAttempts, 0);
});

test('RagSkill configures the RAG MCP connection from url and bearer', () =>
{
  const skill = new RagSkill({
    url: 'http://127.0.0.1:3100/mcp',
    bearer: 'test-bearer',
  });

  assert.ok(skill instanceof McpSkill);
  assert.equal(skill.name, 'RagSkill');
  assert.equal(skill.endpoint, 'http://127.0.0.1:3100/mcp');
  assert.equal(skill.accessToken, 'test-bearer');
  assert.equal(skill.timeout, 360000);
  assert.equal(skill.reconnectDelayMs, 1000);
  assert.equal(skill.maxInlineBlocksChars, 52500);
  assert.equal(skill.toolValueMaxChar, 52500);
  assert.match(skill.usage, /document_search/);
  assert.match(skill.usage, /semanticQuery must express the complete meaning and intent of the user's request in natural language/);
  assert.match(skill.usage, /lexicalQuery must contain the discriminating terms expected to appear literally in the source documents/);
  assert.match(skill.usage, /Remove articles, pronouns, generic verbs, and other non-discriminating words from lexicalQuery/);
  assert.match(skill.usage, /When semanticQuery is used, omitting lexicalQuery is allowed only when no meaningful literal keyword can be extracted after resolving the request/);
  assert.match(skill.usage, /document_get returns page images, metadata, descriptions, and complete page blocks/);
  assert.match(skill.usage, /When blocksTempFileName is returned, always read it with TempFileManagerSkill before analyzing the page/);
  assert.match(skill.usage, /Block coordinates are intentionally omitted from document_get responses to reduce context size/);
  assert.match(skill.usage, /Never infer visual proximity, alignment, grouping, columns, table relationships, chart relationships, or reading order from the block array order/);
  assert.match(skill.usage, /Use only blocks of type 'text' or 'title' as evidence/);
  assert.match(skill.usage, /page_highlight/);
  assert.match(skill.usage, /document_add/);
  assert.match(skill.usage, /If information about the document is known, pass it in description/);
  assert.match(skill.usage, /If no information about the document is known, omit description entirely/);
  assert.match(skill.usage, /Never calculate, normalize, modify, validate, estimate, expand, shrink, or replace highlight coordinates/);
});

test('RagSkill supports a skill-specific tool result size limit', async () =>
{
  const skill = new RagSkill({
    url: 'http://127.0.0.1:3100/mcp',
    bearer: 'test-bearer',
    toolValueMaxChar: 30000,
  });
  const result = { content: 'A'.repeat(25000) };

  const parsedResult = await skill._parseToolValue(result, 'rag-call', [], 'stream-1', 'results', {});

  assert.equal(skill.toolValueMaxChar, 30000);
  assert.equal(skill.maxInlineBlocksChars, 30000);
  assert.deepEqual(parsedResult, result);
});

test('RagSkill externalizes tool results above its skill-specific limit', async () =>
{
  const storedFiles = [];
  const skill = new RagSkill({
    url: 'http://127.0.0.1:3100/mcp',
    bearer: 'test-bearer',
    toolValueMaxChar: 30000,
  });
  skill.agent = {
    skills: new Map([['TempFileManagerSkill', {
      async temp_file_remove() {},
      async temp_file_create(file) { storedFiles.push({ file, data: null }); },
      async appendBuffer(file) { storedFiles.at(-1).data = file.data; },
    }]]),
  };

  const parsedResult = await skill._parseToolValue({ content: 'A'.repeat(31000) }, 'rag-call', [], 'stream-1', 'results', {});

  assert.equal(parsedResult.storedInTempFile, true);
  assert.equal(parsedResult.tempFileName, 'internal/tool/results/rag-call/response.json');
  assert.equal(storedFiles.length, 1);
});

test('McpSkill generates tool schemas with an explicit required array', () =>
{
  const skill = new RagSkill({
    url: 'http://127.0.0.1:3100/mcp',
    bearer: 'test-bearer',
  });
  const generated = skill._buildDynamicTools([{
    name: 'document_search',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
    },
    outputSchema: {
      type: 'object',
      properties: { chunks: { type: 'array', items: { type: 'string' } } },
      required: ['chunks'],
    },
  }]);

  assert.deepEqual(generated.tools[0].parameters.required, []);
  assert.deepEqual(generated.tools[1].parameters.required, []);
  assert.deepEqual(generated.tools[1].outputSchema.properties.chunks.items, { type: 'string' });

  const agent = new Agent();
  agent.registerSkill(skill);
  skill.streamStates.set('stream-1', {
    negotiatedProtocolVersion: '2025-11-25',
    tools: generated.tools,
    toolNameMap: generated.toolNameMap,
  });
  const modelTool = agent.buildModelTools(new Set(['RagSkill']), 'stream-1').find((tool) => tool.function.name.endsWith('document_search'));
  assert.deepEqual(modelTool.function.outputSchema.properties.chunks.items, { type: 'string' });
});

test('McpSkill keeps startup alive and reconnects after a connection failure', async () =>
{
  const skill = new McpSkill({
    name: 'TestMcpSkill',
    endpoint: 'http://127.0.0.1:3100/mcp',
    reconnectDelayMs: 10,
  });
  let loadAttempts = 0;

  skill._loadStreamState = async (streamId) =>
  {
    loadAttempts += 1;

    if (loadAttempts === 1)
    {
      throw new TypeError('fetch failed');
    }

    skill.streamStates.set(streamId, {
      ...skill._createStreamState(),
      negotiatedProtocolVersion: '2025-11-25',
      tools: [{ name: 'test_mcp_ping', parameters: { type: 'object', properties: {}, required: [] } }],
      toolNameMap: new Map([['test_mcp_ping', 'ping']]),
    });

    return { ok: true, status: 'loaded', toolCount: 1 };
  };

  const initialResult = await skill.load({ streamId: 'stream-1' });

  assert.equal(initialResult.status, 'reconnecting');
  assert.equal(skill.isInitialized('stream-1'), false);

  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(loadAttempts, 2);
  assert.equal(skill.isInitialized('stream-1'), true);
});

test('RagSkill exposes temporary-file arguments for document add and get', () =>
{
  const skill = new RagSkill({ url: 'http://127.0.0.1:3100/mcp', bearer: 'test-bearer' });
  const generated = skill._buildDynamicTools([
    {
      name: 'document_add',
      inputSchema: {
        type: 'object',
        properties: { file: { type: 'object' }, domain: { type: 'string' }, description: { type: 'string' } },
        required: ['file', 'domain'],
        additionalProperties: false,
      },
    },
    {
      name: 'document_search',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          weights: {
            type: 'object',
            properties: { content: { type: 'number' }, pageDescription: { type: 'number' }, documentDescription: { type: 'number' } },
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
    {
      name: 'document_get',
      inputSchema: {
        type: 'object',
        properties: { documentUuid: { type: 'string' }, includeOriginal: { type: 'boolean' } },
        required: ['documentUuid'],
        additionalProperties: false,
      },
    },
  ]);

  assert.deepEqual(generated.tools[1].parameters.required, ['tempFileName', 'domain']);
  assert.deepEqual(Object.keys(generated.tools[1].parameters.properties), ['tempFileName', 'fileName', 'domain', 'description']);
  assert.ok(generated.tools[2].parameters.properties.weights);
  assert.ok(generated.tools[3].parameters.properties.includeOriginal);
});

test('RagSkill leaves page image retrieval to document_get', async () =>
{
  const createdFiles = [];
  const tempFileManagerSkill = {
    async createFile(file)
    {
      createdFiles.push(file);
    },
  };
  const skill = new RagSkill({ url: 'http://127.0.0.1:3100/mcp', bearer: 'test-bearer', tempFileManagerSkill });
  skill._callTool = async (streamId, toolName, args) =>
  {
    assert.equal(streamId, 'stream-1');
    assert.equal(toolName, 'document_get');
    assert.deepEqual(args, { documentUuid: 'document-1', pageNumbers: [1, 3], includeOriginal: false });
    return {
      structuredContent: {
        documentUuid: 'document-1',
        name: 'guide.pdf',
        pages: [{ pageNumber: 1 }, { pageNumber: 3 }],
      },
      content: [
        { type: 'image', mimeType: 'image/png', data: Buffer.from('PAGE1').toString('base64') },
        { type: 'image', mimeType: 'image/png', data: Buffer.from('PAGE3').toString('base64') },
      ],
    };
  };

  const result = await skill._processMcpToolResult('document_search', {
    structuredContent: {
      result: [
        { documentUuid: 'document-1', pageNumber: 1 },
        { documentUuid: 'document-1', pageNumber: 3 },
      ],
    },
    content: [],
  }, { query: 'guide', outputDirectory: 'rag/search' }, { streamId: 'stream-1' });

  assert.deepEqual(createdFiles, []);
  assert.equal('temporaryFiles' in result, false);
});

test('RagSkill accepts nested document_search pages without blocks', async () =>
{
  const skill = new RagSkill({
    url: 'http://127.0.0.1:3100/mcp',
    bearer: 'test-bearer',
    tempFileManagerSkill: { async createFile() {} },
  });
  const result = await skill._processMcpToolResult('document_search', {
    structuredContent: {
      documents: [{
        documentUuid: 'document-1',
        pages: [{ pageNumber: 1, chunks: ['Relevant text'] }],
      }],
    },
    content: [{ type: 'text', text: '1 document search result returned.' }],
  }, {}, { streamId: 'stream-1' });

  assert.equal(result.structuredContent.documents[0].pages[0].chunks[0], 'Relevant text');
  assert.equal('temporaryFiles' in result, false);
});

test('RagSkill converts a temporary file to the document_add MCP payload', async () =>
{
  const tempFileManagerSkill = {
    async _getFile(tempFileName, streamId)
    {
      assert.equal(tempFileName, 'uploads/report.pdf');
      assert.equal(streamId, 'stream-1');
      return { data: Buffer.from('PDF') };
    },
  };
  const skill = new RagSkill({ url: 'http://127.0.0.1:3100/mcp', bearer: 'test-bearer', tempFileManagerSkill });
  const args = await skill._prepareMcpToolArguments('document_add', {
    tempFileName: 'uploads/report.pdf',
    domain: 'DSI',
  }, { streamId: 'stream-1' });

  assert.deepEqual(args, {
    file: { name: 'report.pdf', dataBase64: Buffer.from('PDF').toString('base64') },
    domain: 'DSI',
  });
});

test('RagSkill passes known document context to document_add', async () =>
{
  const tempFileManagerSkill = {
    async _getFile()
    {
      return { data: Buffer.from('IMAGE') };
    },
  };
  const skill = new RagSkill({ url: 'http://127.0.0.1:3100/mcp', bearer: 'test-bearer', tempFileManagerSkill });
  const args = await skill._prepareMcpToolArguments('document_add', {
    tempFileName: 'uploads/extracted-image.png',
    domain: 'DSI',
    description: 'Image extraite du rapport annuel montrant la gouvernance du programme.',
  }, { streamId: 'stream-1' });

  assert.deepEqual(args, {
    file: { name: 'extracted-image.png', dataBase64: Buffer.from('IMAGE').toString('base64') },
    domain: 'DSI',
    description: 'Image extraite du rapport annuel montrant la gouvernance du programme.',
  });
});

test('RagSkill accepts a successful document_add result without page files', async () =>
{
  const skill = new RagSkill({
    url: 'http://127.0.0.1:3100/mcp',
    bearer: 'test-bearer',
    tempFileManagerSkill: { async createFile() {} },
  });
  const result = await skill._processMcpToolResult('document_add', {
    content: [{ type: 'text', text: 'Document added and indexed.' }],
    temporaryFiles: [{ tempFileName: 'legacy/file.json' }],
    structuredContent: {
      result: { documentUuid: 'document-1', name: 'report.pdf', pageCount: 4 },
    },
  }, {}, { streamId: 'stream-1' });

  assert.equal(result.structuredContent.result.documentUuid, 'document-1');
  assert.equal('temporaryFiles' in result, false);
  assert.equal(result.isError, undefined);
});

test('RagSkill stores document_get files in TempFileManagerSkill', async () =>
{
  const createdFiles = [];
  const tempFileManagerSkill = {
    async createFile(file)
    {
      createdFiles.push(file);
    },
  };
  const skill = new RagSkill({ url: 'http://127.0.0.1:3100/mcp', bearer: 'test-bearer', tempFileManagerSkill });
  const result = await skill._processMcpToolResult('document_get', {
    structuredContent: {
      documentUuid: 'document-1',
      name: 'report.pdf',
      pages: [{ pageNumber: 2 }],
    },
    content: [
      { type: 'text', text: '{}' },
      { type: 'image', mimeType: 'image/png', data: Buffer.from('PNG').toString('base64') },
      { type: 'resource', resource: { mimeType: 'application/pdf', blob: Buffer.from('PDF').toString('base64') } },
    ],
  }, { outputDirectory: 'rag/results' }, { streamId: 'stream-1' });

  assert.equal(createdFiles.length, 2);
  assert.deepEqual(createdFiles.map(file => file.tempFileName), [
    'rag/document-1/report.pdf-page-2.png',
    'rag/document-1/report.pdf',
  ]);
  assert.equal(createdFiles[0].data.toString(), 'PNG');
  assert.equal(createdFiles[1].tempFileName, 'rag/document-1/report.pdf');
  assert.equal(createdFiles[1].data.toString(), 'PDF');
  assert.equal(result.structuredContent.pages[0].imageTempFileName, 'rag/document-1/report.pdf-page-2.png');
  assert.equal(result.structuredContent.originalTempFileName, 'rag/document-1/report.pdf');
  assert.equal('temporaryFiles' in result, false);
});

test('RagSkill stores page_highlight images and exposes their temporary file names', async () =>
{
  const createdFiles = [];
  const tempFileManagerSkill = {
    async createFile(file)
    {
      createdFiles.push(file);
    },
  };
  const skill = new RagSkill({ url: 'http://127.0.0.1:3100/mcp', bearer: 'test-bearer', tempFileManagerSkill });
  const result = await skill._processMcpToolResult('page_highlight', {
    structuredContent: {
      pages: [{
        pageUuid: 'page-1',
        documentUuid: 'document-1',
        pageNumber: 3,
        blockIds: ['B004', 'B008'],
        pageImageWidth: 1200,
        pageImageHeight: 1600,
        highlight: { x1: 0.1, y1: 0.2, x2: 0.7, y2: 0.8 },
      }],
    },
    content: [
      { type: 'text', text: '1 page highlight(s) calculated.' },
      { type: 'image', mimeType: 'image/png', data: Buffer.from('PNG').toString('base64') },
    ],
  }, {}, { streamId: 'stream-1' });

  assert.equal(createdFiles.length, 1);
  assert.equal(createdFiles[0].tempFileName, 'rag/document-1/document-page-3.png');
  assert.equal(createdFiles[0].data.toString(), 'PNG');
  assert.equal(result.structuredContent.pages[0].imageTempFileName, 'rag/document-1/document-page-3.png');
});

test('RagSkill stores highlighted pages without document UUID under distinct page UUID paths', async () =>
{
  const createdFiles = [];
  const tempFileManagerSkill = { async createFile(file) { createdFiles.push(file); } };
  const skill = new RagSkill({ url: 'http://127.0.0.1:3100/mcp', bearer: 'test-bearer', tempFileManagerSkill });
  const result = await skill._processMcpToolResult('page_highlight', {
    structuredContent: {
      pages: [
        { pageUuid: 'page-1', sourceFileName: 'first.pdf', pageNumber: 1 },
        { pageUuid: 'page-2', sourceFileName: 'second.pdf', pageNumber: 1 },
      ],
    },
    content: [
      { type: 'image', mimeType: 'image/png', data: Buffer.from('FIRST').toString('base64') },
      { type: 'image', mimeType: 'image/png', data: Buffer.from('SECOND').toString('base64') },
    ],
  }, {}, { streamId: 'stream-1' });

  assert.deepEqual(createdFiles.map(file => file.tempFileName), [
    'rag/page-1/document-page-1.png',
    'rag/page-2/document-page-1.png',
  ]);
  assert.deepEqual(result.structuredContent.pages.map(page => page.imageTempFileName), [
    'rag/page-1/document-page-1.png',
    'rag/page-2/document-page-1.png',
  ]);
  assert.deepEqual(createdFiles.map(file => file.data.toString()), ['FIRST', 'SECOND']);
});

test('RagSkill stores files returned for multiple documents', async () =>
{
  const createdFiles = [];
  const tempFileManagerSkill = { async createFile(file) { createdFiles.push(file); } };
  const skill = new RagSkill({ url: 'http://127.0.0.1:3100/mcp', bearer: 'test-bearer', tempFileManagerSkill });
  const firstBlocks = { type: 'page', x: 0, y: 0, width: 100, height: 200, children: [] };
  const secondBlocks = { type: 'page', x: 0, y: 0, width: 300, height: 400, children: [] };

  const result = await skill._processMcpToolResult('document_get', {
    structuredContent: {
      documents: [
        { documentUuid: 'document-1', originalFilename: 'first.pdf', pages: [{ pageNumber: 1, blocks: firstBlocks }] },
        { documentUuid: 'document-2', originalFilename: 'second.pdf', pages: [{ pageNumber: 3, blocks: secondBlocks }] },
      ],
    },
    content: [
      { type: 'image', mimeType: 'image/png', data: Buffer.from('PAGE1').toString('base64') },
      { type: 'image', mimeType: 'image/png', data: Buffer.from('PAGE3').toString('base64') },
      { type: 'resource', resource: { uri: 'rag://document/document-1/original', mimeType: 'application/pdf',
        blob: Buffer.from('FIRST').toString('base64') } },
      { type: 'resource', resource: { uri: 'rag://document/document-2/original', mimeType: 'application/pdf',
        blob: Buffer.from('SECOND').toString('base64') } },
    ],
  }, {}, { streamId: 'stream-1' });

  assert.deepEqual(createdFiles.map(file => file.tempFileName), [
    'rag/document-1/first.pdf-page-1.png',
    'rag/document-2/second.pdf-page-3.png',
    'rag/document-1/first.pdf',
    'rag/document-2/second.pdf',
  ]);
  assert.equal(createdFiles[2].data.toString(), 'FIRST');
  assert.equal(createdFiles[3].data.toString(), 'SECOND');
  assert.deepEqual(result.structuredContent.documents.flatMap(document => document.pages.map(page => page.blocks)), [
    { type: 'page', children: [] },
    { type: 'page', children: [] },
  ]);
  assert.deepEqual(result.structuredContent.documents.map(document => document.pages[0].imageTempFileName), [
    'rag/document-1/first.pdf-page-1.png',
    'rag/document-2/second.pdf-page-3.png',
  ]);
  assert.deepEqual(result.structuredContent.documents.map(document => document.originalTempFileName), [
    'rag/document-1/first.pdf',
    'rag/document-2/second.pdf',
  ]);
  assert.equal('temporaryFiles' in result, false);
  assert.equal('pages' in result.structuredContent, false);
});

test('RagSkill returns compact document_get page blocks inline when the complete response fits', async () =>
{
  const createdFiles = [];
  const tempFileManagerSkill = { async createFile(file) { createdFiles.push(file); } };
  const skill = new RagSkill({ url: 'http://127.0.0.1:3100/mcp', bearer: 'test-bearer', tempFileManagerSkill });
  const blocks = { x: 0, y: 0, width: 1000, height: 800, children: [
    { type: 'image', content: 'Service & équipe', x: 100, y: 160, width: 300, height: 240, source: 'vision', confidence: 1,
      childWidth: 600, childHeight: 480, children: [
        { type: 'text', content: '<Direction>', x: 20, y: 30, width: 200, height: 40, source: 'ocr', confidence: 0.9 },
      ] },
  ] };
  const result = await skill._processMcpToolResult('document_get', {
    structuredContent: { documentUuid: 'document-1', name: 'report.pdf', pages: [{ pageNumber: 2, blocks }] },
    content: [{ type: 'image', mimeType: 'image/png', data: Buffer.from('PNG').toString('base64') }],
  }, { outputDirectory: 'rag/results' }, { streamId: 'stream-1' });

  assert.equal(createdFiles[0].tempFileName, 'rag/document-1/report.pdf-page-2.png');
  assert.deepEqual(result.structuredContent.pages[0].blocks, {
    children: [{ type: 'image', content: 'Service & équipe', children: [{ type: 'text', content: '<Direction>' }] }],
  });
  assert.equal(result.structuredContent.pages[0].blocksTempFileName, undefined);
  assert.equal(blocks.x2, undefined);
  assert.equal(blocks.children[0].x2, undefined);
  assert.equal(result.structuredContent.pages[0].blockCount, 2);
  assert.equal(result.structuredContent.pages[0].imageTempFileName, 'rag/document-1/report.pdf-page-2.png');
  assert.equal(result.componentHtml, undefined);
  assert.equal('temporaryFiles' in result, false);
});

test('RagSkill stores page blocks when their response exceeds the configured inline limit', async () =>
{
  const createdFiles = [];
  const tempFileManagerSkill = { async createFile(file) { createdFiles.push(file); } };
  const skill = new RagSkill({
    url: 'http://127.0.0.1:3100/mcp',
    bearer: 'test-bearer',
    tempFileManagerSkill,
    maxInlineBlocksChars: 100,
  });
  const blocks = { type: 'page', x: 0, y: 0, width: 100, height: 100, children: [
    { type: 'text', content: 'A'.repeat(100), x: 0, y: 0, width: 100, height: 20 },
  ] };

  const result = await skill._processMcpToolResult('document_get', {
    structuredContent: { documentUuid: 'document-1', name: 'report.pdf', pages: [{ pageNumber: 1, blocks }] },
    content: [],
  }, {}, { streamId: 'stream-1' });

  assert.equal(skill.maxInlineBlocksChars, 100);
  assert.equal(createdFiles[0].tempFileName, 'rag/document-1/report.pdf-page-1-blocks.json');
  assert.equal(result.structuredContent.pages[0].blocks, undefined);
  assert.equal(result.structuredContent.pages[0].blocksTempFileName, 'rag/document-1/report.pdf-page-1-blocks.json');
});

test('RagSkill measures the complete response before externalizing unindented multiline blocks', async () =>
{
  const createdFiles = [];
  const tempFileManagerSkill = { async createFile(file) { createdFiles.push(file); } };
  const blocks = { type: 'page', x: 0, y: 0, width: 10, height: 10, children: [
    { type: 'text', content: 'é', box: [0, 0, 10, 10] },
  ] };
  const responseBlocks = [{ type: 'page', children: [{ type: 'text', content: 'é' }] }];
  const serializedResponseBlocks = JSON.stringify(responseBlocks, null, 2)
    .replace(/^[ \t]+/gm, '');
  const unindentedSize = Buffer.byteLength(serializedResponseBlocks, 'utf8');
  const skill = new RagSkill({
    url: 'http://127.0.0.1:3100/mcp',
    bearer: 'test-bearer',
    tempFileManagerSkill,
    maxInlineBlocksChars: unindentedSize + 1,
  });

  const result = await skill._processMcpToolResult('document_get', {
    structuredContent: { documentUuid: 'document-1', name: 'report.pdf', description: 'A'.repeat(100), pages: [{ pageNumber: 1, blocks }] },
    content: [],
  }, {}, { streamId: 'stream-1' });

  assert.equal(result.structuredContent.pages[0].blocks, undefined);
  assert.equal(result.structuredContent.pages[0].blocksTempFileName, 'rag/document-1/report.pdf-page-1-blocks.json');
  assert.equal(createdFiles.length, 1);
  const storedBlocks = createdFiles[0].data.toString('utf8');
  assert.equal(storedBlocks.includes('\n'), true);
  assert.equal(storedBlocks.split('\n').some(line => /^[ \t]+/.test(line)), false);
  assert.equal(storedBlocks.includes('"box"'), false);
  assert.deepEqual(JSON.parse(storedBlocks), responseBlocks[0]);
});

test('RagSkill ignores returned file payloads when deciding whether to externalize blocks', async () =>
{
  const createdFiles = [];
  const tempFileManagerSkill = { async createFile(file) { createdFiles.push(file); } };
  const skill = new RagSkill({
    url: 'http://127.0.0.1:3100/mcp', bearer: 'test-bearer', tempFileManagerSkill, maxInlineBlocksChars: 1000,
  });
  const blocks = { type: 'page', pageMinX: 0, pageMinY: 0, pageMaxX: 10, pageMaxY: 10, children: [] };
  const result = await skill._processMcpToolResult('document_get', {
    structuredContent: { pages: [{ documentUuid: 'document-1', documentName: 'report.pdf', pageNumber: 1, blocks }] },
    content: [{ type: 'image', mimeType: 'image/png', data: Buffer.alloc(2000).toString('base64') }],
  }, {}, { streamId: 'stream-1' });

  assert.notEqual(result.structuredContent.pages[0].blocks, undefined);
  assert.equal(result.structuredContent.pages[0].blocksTempFileName, undefined);
  assert.equal(result.structuredContent.pages[0].imageTempFileName, 'rag/document-1/report.pdf-page-1.png');
  assert.equal(createdFiles.length, 1);
});

test('RagSkill tool result keeps line breaks without indentation', async () =>
{
  const output = AgentUtils.formatToolResult({ pages: [{ blocks: { children: [{ content: 'Text' }] } }] });

  assert.equal(output.includes('\n'), true);
  assert.equal(output.split('\n').some(line => /^[ \t]+/.test(line)), false);
});

test('RagSkill removes all block positions returned to the agent', () =>
{
  const skill = new RagSkill({ url: 'http://127.0.0.1:3100/mcp', bearer: 'test-bearer' });
  const blocks = skill._prepareBlocksForResponse({
    type: 'page', x: 0, y: 0, width: 1169, height: 827,
    pageMinX: 0, pageMinY: 79.3653225806451, pageMaxX: 1168.6666666666665, pageMaxY: 827.0000000000001,
    children: [{
      type: 'text', content: 'Text', x: 44, y: 60, width: 92, height: 29, x2: 136, y2: 89, box: [44, 60, 136, 89],
      childWidth: 92, childHeight: 29, source: 'ocr', confidence: 0.9,
      pageMinX: 44.33, pageMinY: 59.69, pageMaxX: 135.67, pageMaxY: 89.37,
    }],
  });

  assert.deepEqual(blocks, {
    type: 'page',
    children: [{ type: 'text', content: 'Text' }],
  });
});