import assert from 'node:assert/strict';
import test from 'node:test';
import { Agent } from '../src/Agent.js';
import { OpenAIEmbedding } from '../src/net/client/openai/OpenAIEmbedding.js';
import { OpenAiEmbeddingSkill } from '../src/skills/beta/OpenAiEmbeddingSkill.js';
import { OpenAIClientSkill } from '../src/skills/beta/OpenAIClientSkill.js';

test('OpenAIEmbedding calls the embeddings endpoint and preserves vector order', async () =>
{
  const originalFetch = globalThis.fetch;
  let requestUrl;
  let requestBody;

  globalThis.fetch = async (url, options) =>
  {
    requestUrl = url;
    requestBody = JSON.parse(options.body);

    return new Response(JSON.stringify({
      object: 'list',
      data: [
        { object: 'embedding', index: 0, embedding: [0.1, 0.2] },
        { object: 'embedding', index: 1, embedding: [0.3, 0.4] },
      ],
      model: 'text-embedding-test',
      usage: { prompt_tokens: 4, total_tokens: 4 },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'x-litellm-response-cost': '0.001' },
    });
  };

  try
  {
    const client = new OpenAIEmbedding({ apiKey: 'test-key', model: 'text-embedding-test', url: 'https://example.test/' });
    const response = await client.createEmbeddings({ input: ['one', 'two'], dimensions: 2 });

    assert.equal(requestUrl, 'https://example.test/v1/embeddings');
    assert.deepEqual(requestBody, {
      model: 'text-embedding-test',
      input: ['one', 'two'],
      encoding_format: 'float',
      dimensions: 2,
    });
    assert.deepEqual(response.embeddings, [[0.1, 0.2], [0.3, 0.4]]);
    assert.equal(response.cost, 0.001);
  }
  finally
  {
    globalThis.fetch = originalFetch;
  }
});

test('OpenAiEmbeddingSkill exposes embeddings through its dedicated tool', async () =>
{
  const skill = new OpenAiEmbeddingSkill({ apiKey: 'test-key', model: 'text-embedding-test', url: 'https://example.test/' });
  skill.openAIClient.createEmbeddings = async request => ({
    model: request.model ?? 'text-embedding-test',
    embeddings: [[1, 2, 3]],
    usage: { total_tokens: 1 },
    cost: 0.002,
  });

  const result = await skill.open_ai_create_embeddings({ input: ['text'], model: null, dimensions: null, encodingFormat: null, user: null });

  assert.equal(result.success, true);
  assert.deepEqual(result.embeddings, [[1, 2, 3]]);
  assert.equal(result.cost, 0.002);
  assert.equal(result.response.cost, 0.002);
});

test('OpenAiEmbeddingSkill externalizes large embedding results before creating events', async () =>
{
  const skill = new OpenAiEmbeddingSkill({ apiKey: 'test-key', model: 'text-embedding-test', url: 'https://example.test/' });
  const storedFiles = [];

  skill.agent = {
    skills: new Map([
      ['TempFileManagerSkill', {
        async temp_file_remove() {},
        async temp_file_create(file) { storedFiles.push({ file, data: null }); },
        async appendBuffer(file) { storedFiles.at(-1).data = file.data; },
      }],
    ]),
  };

  assert.equal(skill.processToolData('open_ai_create_embeddings'), true);

  const parsedResult = await skill._parseToolValue({
    embeddings: [Array.from({ length: 3000 }, () => 0.123456)],
  }, 'embedding-call', [], 'stream-1', 'results', {});

  assert.equal(parsedResult.storedInTempFile, true);
  assert.equal(parsedResult.success, true);
  assert.equal(parsedResult.tempFileName, 'internal/tool/results/embedding-call/response.json');
  assert.equal(parsedResult.message, 'Tool results data are available in internal/tool/results/embedding-call/response.json.');
  assert.equal(storedFiles.length, 1);
  const storedJson = storedFiles[0].data.toString('utf8');
  assert.match(storedJson, /0\.123456/);
  assert.ok(storedJson.split('\n').length > 1);
  assert.equal(storedJson.split('\n').some(line => /^[ \t]+/.test(line)), false);
  assert.deepEqual(JSON.parse(storedJson), { embeddings: [Array.from({ length: 3000 }, () => 0.123456)] });
});

test('AgentSkill externalizes a large aggregate result before creating an oversized event', async () =>
{
  const skill = new OpenAiEmbeddingSkill({ apiKey: 'test-key', model: 'text-embedding-test', url: 'https://example.test/' });
  const storedFiles = [];

  skill.agent = {
    skills: new Map([
      ['TempFileManagerSkill', {
        async temp_file_remove() {},
        async temp_file_create(file) { storedFiles.push({ file, data: null }); },
        async appendBuffer(file) { storedFiles.at(-1).data = file.data; },
      }],
    ]),
  };

  const result = {
    structuredContent: {
      pages: Array.from({ length: 20 }, (_, index) => ({
        documentUuid: `document-${index}`,
        pageNumber: index + 1,
        description: 'A'.repeat(1200),
      })),
    },
    temporaryFiles: Array.from({ length: 20 }, (_, index) => ({
      tempFileName: `rag/document-${index}/page-${index + 1}.png`,
      mimeType: 'image/png',
      size: 1000,
    })),
  };

  const parsedResult = await skill._parseToolValue(result, 'rag-call', [], 'stream-1', 'results', {});

  assert.equal(parsedResult.storedInTempFile, true);
  assert.equal(parsedResult.tempFileName, 'internal/tool/results/rag-call/response.json');
  assert.equal(storedFiles.length, 1);
  assert.equal(storedFiles[0].file.mimeType, 'application/json');
  assert.deepEqual(JSON.parse(storedFiles[0].data.toString('utf8')), result);
});

test('OpenAIClientSkill supports registered embedding models and endpoint configuration', async () =>
{
  const skill = new OpenAIClientSkill();
  let clientOptions;
  let embeddingRequest;

  skill.embeddingFactory = options =>
  {
    clientOptions = options;

    return {
      async createEmbeddings(request)
      {
        embeddingRequest = request;
        return {
          embeddings: [[0.5, 0.6]],
          model: request.model,
          usage: { total_tokens: 2 },
          cost: 0.003,
        };
      },
    };
  };

  skill.registerServer('test', {
    apiKey: 'test-key',
    url: 'https://example.test/',
    config: {
      embedding: { encoding_format: 'float', dimensions: 8 },
    },
  });
  skill.registerModel('test', 'embedding-model', {
    endpoints: ['embedding'],
    config: {
      embedding: { dimensions: 4 },
    },
  });

  const result = await skill.open_ai_call_embedding({
    input: ['hello'],
    model: 'test-embedding-model',
    dimensions: null,
    encodingFormat: null,
    user: null,
    request: null,
    timeoutMs: null,
  }, { streamId: Agent.GLOBAL_STREAM_ID });

  assert.deepEqual(clientOptions, {
    apiKey: 'test-key',
    url: 'https://example.test/',
    model: 'embedding-model',
  });
  assert.equal(embeddingRequest.dimensions, 4);
  assert.equal(embeddingRequest.encoding_format, 'float');
  assert.deepEqual(result.embeddings, [[0.5, 0.6]]);
  assert.equal(result.endpoint, 'embedding');
  assert.equal(result.cost, 0.003);
});
