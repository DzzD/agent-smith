import assert from 'node:assert/strict';
import test from 'node:test';
import { Agent } from '../src/Agent.js';
import { OpenAIChatCompletion } from '../src/net/client/openai/OpenAIChatCompletion.js';
import { OpenAIClientSkill } from '../src/skills/beta/OpenAIClientSkill.js';

test('OpenAIChatCompletion logs message character and estimated token counts with the role', () =>
{
  const client = new OpenAIChatCompletion({ apiKey: 'test-key', averageCharsPerToken: 4 });
  const message = { role: 'user', content: 'Hello' };
  const logs = [];
  const originalConsoleDebug = console.debug;

  console.debug = (...args) => logs.push(args.join(' '));

  try
  {
    client.logMessages([message]);
  }
  finally
  {
    console.debug = originalConsoleDebug;
  }

  const messageChars = JSON.stringify(message).length;

  assert.ok(logs.includes(`role: user | chars: ${messageChars} | tokens: ~${Math.ceil(messageChars / 4)}`));
});

test('OpenAIChatCompletion reconstructs streamed responses and measures TTFT and throughput', async () =>
{
  const client = new OpenAIChatCompletion({ apiKey: 'test-key', stream: true });
  const originalFetch = globalThis.fetch;
  let requestBody;

  globalThis.fetch = async (url, options) =>
  {
    requestBody = JSON.parse(options.body);
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(options.headers.Accept, 'text/event-stream');

    const events = [
      { id: 'completion-1', model: 'test-model', choices: [{ index: 0, delta: { role: 'assistant', content: 'Hello ' } }] },
      { choices: [{ index: 0, delta: { content: 'world', reasoning_content: 'Reason' } }] },
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'send_', arguments: '{"text":' } }] } }] },
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { name: 'message', arguments: '"ok"}' } }] }, finish_reason: 'tool_calls' }] },
      { choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, prompt_tokens_details: { cached_tokens: 0 } } },
      { choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, prompt_tokens_details: { cached_tokens: 6 } } },
    ];
    const streamBody = `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`;

    return new Response(streamBody, { status: 200, headers: { 'Content-Type': 'text/event-stream', 'x-response-cost': '0.01' } });
  };

  try
  {
    const response = await client.generate({ input: 'Test' });

    assert.equal(requestBody.stream, true);
    assert.deepEqual(requestBody.stream_options, { include_usage: true });
    assert.equal(response.request.stream, undefined);
    assert.equal(response.assistant_text, 'Hello world');
    assert.equal(response.choices[0].message.reasoning_content, 'Reason');
    assert.deepEqual(response.choices[0].message.tool_calls, [{
      id: 'call_1', type: 'function', function: { name: 'send_message', arguments: '{"text":"ok"}' },
    }]);
    assert.deepEqual(response.usage, {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
      prompt_tokens_details: { cached_tokens: 6 },
    });
    assert.equal(response.cost, 0.01);
    assert.equal(response.metrics.streaming, true);
    assert.equal(Number.isFinite(response.metrics.durationMs), true);
    assert.equal(Number.isFinite(response.metrics.timeToFirstTokenMs), true);
    assert.equal(Number.isFinite(response.metrics.outputTokensPerSecond), true);
  }
  finally
  {
    globalThis.fetch = originalFetch;
  }
});

test('OpenAIChatCompletion measures throughput until the stream completes', async () =>
{
  const client = new OpenAIChatCompletion({ apiKey: 'test-key', stream: true });
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
  {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller)
      {
        controller.enqueue(encoder.encode('data: {"choices":[{"index":0,"delta":{"content":"Hello"}}]}\n\n'));
        await new Promise(resolve => setTimeout(resolve, 50));
        controller.enqueue(encoder.encode('data: {"choices":[],"usage":{"completion_tokens":10}}\n\ndata: [DONE]\n\n'));
        controller.close();
      },
    });

    return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  };

  try
  {
    const response = await client.generate({ input: 'Test' });

    assert.ok(response.metrics.outputTokensPerSecond >= 100);
    assert.ok(response.metrics.outputTokensPerSecond <= 300);
  }
  finally
  {
    globalThis.fetch = originalFetch;
  }
});

test('OpenAIClientSkill exposes streaming for chat completions', async () =>
{
  const skill = new OpenAIClientSkill();
  let clientOptions;

  const chatCompletionTool = skill.tools.find((tool) => tool.name === 'open_ai_call_chat_completion');
  assert.deepEqual(chatCompletionTool.parameters.properties.stream.type, ['boolean', 'null']);
  assert.equal(chatCompletionTool.parameters.required.includes('prompt'), false);

  skill.chatCompletionFactory = (options) =>
  {
    clientOptions = options;

    return {
      async generate()
      {
        return {
          assistant_text: 'Streamed response',
          metrics: { streaming: true, timeToFirstTokenMs: 10, outputTokensPerSecond: 50 },
        };
      },
    };
  };

  skill.registerServer('test', { apiKey: 'test-key', url: 'https://example.test/' });
  skill.registerModel('test', 'stream-model', { endpoints: ['chatCompletion'] });

  const result = await skill.open_ai_call_chat_completion({
    prompt: 'Hello',
    model: 'test-stream-model',
    stream: true,
    timeoutMs: null,
  }, { streamId: Agent.GLOBAL_STREAM_ID });

  assert.equal(clientOptions.stream, true);
  assert.equal(result.response.metrics.streaming, true);
  assert.equal(result.response.metrics.timeToFirstTokenMs, 10);
  assert.equal(result.response.metrics.outputTokensPerSecond, 50);
});

test('OpenAIClientSkill sends a temporary text file to chat completion without an inline prompt', async () =>
{
  const skill = new OpenAIClientSkill();
  let generateOptions;

  skill.agent = {
    skills: new Map([['TempFileManagerSkill', {
      async temp_file_read()
      {
        return 'Large chat prompt';
      },
    }]]),
  };
  skill.chatCompletionFactory = () => ({
    async generate(options)
    {
      generateOptions = options;
      return { assistant_text: 'Chat response' };
    },
  });
  skill.registerServer('test', { apiKey: 'test-key', url: 'https://example.test/' });
  skill.registerModel('test', 'chat-model', { endpoints: ['chatCompletion'] });

  const result = await skill.open_ai_call_chat_completion({
    model: 'test-chat-model',
    inputTempFileNames: ['prompts/large.txt'],
  }, { streamId: Agent.GLOBAL_STREAM_ID });

  assert.equal(generateOptions.input, 'Input file: prompts/large.txt\nLarge chat prompt');
  assert.deepEqual(result.files.inputTempFileNames, ['prompts/large.txt']);
});