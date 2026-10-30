import assert from 'node:assert/strict';
import test from 'node:test';
import { Agent } from '../src/Agent.js';
import { OpenAIResponse } from '../src/net/client/openai/OpenAIResponse.js';
import { OpenAIClientSkill } from '../src/skills/beta/OpenAIClientSkill.js';

test('OpenAIResponse calls the responses endpoint and extracts output text', async () =>
{
  const client = new OpenAIResponse({ apiKey: 'test-key', request: { temperature: 0.2 } });
  let endpointPath;
  let requestBody;

  client.postJson = async (path, body) =>
  {
    endpointPath = path;
    requestBody = body;

    return {
      endpointUrl: 'https://api.openai.com/v1/responses',
      payload: {
        output: [{ content: [{ type: 'output_text', text: 'Response text' }] }],
        usage: { total_tokens: 8 },
      },
    };
  };

  const result = await client.generate({ model: 'gpt-test', input: 'Hello', instructions: 'Be concise.' });

  assert.equal(endpointPath, 'responses');
  assert.deepEqual(requestBody, { temperature: 0.2, model: 'gpt-test', input: 'Hello', instructions: 'Be concise.' });
  assert.equal(result.outputText, 'Response text');
  assert.deepEqual(result.usage, { total_tokens: 8 });
});

test('OpenAIClientSkill exposes registered models through the Responses endpoint', async () =>
{
  const skill = new OpenAIClientSkill();
  let clientOptions;
  let generateOptions;

  const responseTool = skill.tools.find((tool) => tool.name === 'open_ai_call_response');
  assert.ok(responseTool);
  assert.equal(responseTool.parameters.required.includes('prompt'), false);

  skill.responseFactory = options =>
  {
    clientOptions = options;

    return {
      async generate(options)
      {
        generateOptions = options;
        return { outputText: 'Skill response', usage: { total_tokens: 4 }, cost: 0.01 };
      },
    };
  };

  skill.registerServer('test', {
    apiKey: 'test-key',
    url: 'https://example.test/',
    config: { response: { temperature: 0.4 } },
  });
  skill.registerModel('test', 'response-model', {
    endpoints: ['response'],
    config: { response: { temperature: 0.2 } },
  });

  const result = await skill.open_ai_call_response({
    prompt: 'Hello',
    model: 'test-response-model',
    instructions: 'Be concise.',
    request: { max_output_tokens: 100 },
    timeoutMs: null,
    outputTempFileName: null,
  }, { streamId: Agent.GLOBAL_STREAM_ID });

  assert.deepEqual(clientOptions, {
    apiKey: 'test-key',
    url: 'https://example.test/',
    request: { temperature: 0.2, max_output_tokens: 100 },
  });
  assert.equal(generateOptions.model, 'response-model');
  assert.equal(generateOptions.input, 'Hello');
  assert.equal(generateOptions.instructions, 'Be concise.');
  assert.equal(result.endpoint, 'response');
  assert.equal(result.text, 'Skill response');
  assert.equal(result.cost, 0.01);
});

test('OpenAIClientSkill sends a temporary text file to the Responses endpoint without an inline prompt', async () =>
{
  const skill = new OpenAIClientSkill();
  let generateOptions;

  skill.agent = {
    skills: new Map([['TempFileManagerSkill', {
      async temp_file_read(args)
      {
        assert.equal(args.tempFileName, 'prompts/large.txt');
        assert.equal(args.applyLimit, false);
        return 'Large prompt content';
      },
    }]]),
  };
  skill.responseFactory = () => ({
    async generate(options)
    {
      generateOptions = options;
      return { outputText: 'File response', usage: {} };
    },
  });
  skill.registerServer('test', { apiKey: 'test-key', url: 'https://example.test/' });
  skill.registerModel('test', 'response-model', { endpoints: ['response'] });

  const result = await skill.open_ai_call_response({
    model: 'test-response-model',
    inputTempFileNames: ['prompts/large.txt'],
  }, { streamId: Agent.GLOBAL_STREAM_ID });

  assert.equal(generateOptions.input, 'Input file: prompts/large.txt\nLarge prompt content');
  assert.deepEqual(result.files.inputTempFileNames, ['prompts/large.txt']);
});

test('OpenAIClientSkill combines an inline prompt and temporary text files', async () =>
{
  const skill = new OpenAIClientSkill();
  let generateOptions;

  skill.agent = {
    skills: new Map([['TempFileManagerSkill', {
      async temp_file_read()
      {
        return 'Document content';
      },
    }]]),
  };
  skill.responseFactory = () => ({
    async generate(options)
    {
      generateOptions = options;
      return { outputText: 'Combined response', usage: {} };
    },
  });
  skill.registerServer('test', { apiKey: 'test-key', url: 'https://example.test/' });
  skill.registerModel('test', 'response-model', { endpoints: ['response'] });

  await skill.open_ai_call_response({
    prompt: 'Summarize this document.',
    model: 'test-response-model',
    inputTempFileNames: ['document.txt'],
  }, { streamId: Agent.GLOBAL_STREAM_ID });

  assert.equal(generateOptions.input, 'Summarize this document.\n\nInput file: document.txt\nDocument content');
});