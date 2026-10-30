import assert from 'node:assert/strict';
import test from 'node:test';
import { Agent } from '../src/Agent.js';
import { AgentInput } from '../src/AgentInput.js';
import { AgentSkill } from '../src/AgentSkill.js';
import { BraveSearchSkill } from '../src/skills/beta/BraveSearchSkill.js';
import { OpenAIClient } from '../src/net/client/openai/OpenAIClient.js';
import { getGptImage2Cost } from '../src/net/client/openai/OpenAIImageCost.js';

class CostTestInput extends AgentInput
{
  constructor()
  {
    super({ source: 'cost-test' });
    this.events = [];
    this.endedSubTasks = [];
  }

  async pushEvent(event)
  {
    this.events.push(event);
  }

  async endSubTask(streamId, taskUid = '', status = 'success', cost = null)
  {
    this.endedSubTasks.push({ streamId, taskUid, status, cost });
  }
}

class CostTestSkill extends AgentSkill
{
  constructor(result)
  {
    super();
    this.result = result;
    this.tools = [{
      type: 'function',
      name: 'cost_test',
      description: 'Returns a test result.',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    }];
  }

  async cost_test()
  {
    return structuredClone(this.result);
  }
}

async function executeCostTest(result)
{
  const agent = new Agent({ agentUid: 'cost-test' });
  const skill = new CostTestSkill(result);
  const input = new CostTestInput();
  agent.registerSkill(skill);

  const results = await agent.executeToolCalls(input, 'stream-1', [{
    call_id: 'call-1',
    name: 'cost_test',
    arguments: '{}',
  }], { loadedSkillNames: new Set([skill.name]), errorCountsByTool: new Map(), totalErrorCount: 0, stop: false });

  return { results, input };
}

test('extracts explicit OpenAI-compatible response costs', () =>
{
  const client = new OpenAIClient();
  assert.equal(client.extractCost({ cost: 0.01 }), 0.01);
  assert.equal(client.extractCost({ usage: { total_cost: '0.02' } }), 0.02);
  assert.equal(client.extractCost({ response: { payload: { usage: { cost: 0.03 } } } }), 0.03);
  assert.equal(client.extractCost({ _hidden_params: { response_cost: 0.04 } }), 0.04);
  assert.equal(client.extractCost({ additional_usage_values: { cost: 0.05 } }), 0.05);
  assert.equal(client.extractCost({ usage: { additional_usage_values: { cost: 0.06 } } }), 0.06);
  assert.equal(client.extractCost({ usage: { total_tokens: 100 } }), null);
});

test('extracts LiteLLM costs from HTTP response headers', () =>
{
  const payload = {};
  new OpenAIClient().applyResponseCost(payload, new Headers({ 'x-litellm-response-cost': '0.003382288' }));
  assert.equal(payload.cost, 0.003382288);
});

test('calculates GPT Image 2 costs from usage', () =>
{
  const usage = {
    input_tokens_details: { text_tokens: 65, image_tokens: 10 },
    output_tokens_details: { image_tokens: 196 },
  };
  const expectedCost = (65 * 5 + 10 * 8 + 196 * 30) / 1_000_000;

  assert.equal(getGptImage2Cost(usage), expectedCost);
  assert.equal(getGptImage2Cost(), 0);
});

test('propagates a cost returned by a tool to its event and subtask', async () =>
{
  const { results, input } = await executeCostTest({ ok: true, cost: 0.04 });
  const resultEvent = input.events.find((event) => event.type === 'tool_result');

  assert.equal(results[0].result.cost, 0.04);
  assert.equal(resultEvent.data.cost, 0.04);
  assert.equal(input.endedSubTasks[0].cost, 0.04);
});

test('does not add or propagate a cost when the tool omits it', async () =>
{
  const { results, input } = await executeCostTest({ ok: true });
  const resultEvent = input.events.find((event) => event.type === 'tool_result');

  assert.equal('cost' in results[0].result, false);
  assert.equal('cost' in resultEvent.data, false);
  assert.equal(input.endedSubTasks[0].cost, null);
});

test('propagates a cost owned by a nested client response', async () =>
{
  const { results, input } = await executeCostTest({ ok: true, response: { cost: 0.05 } });
  const resultEvent = input.events.find((event) => event.type === 'tool_result');

  assert.equal(results[0].cost, 0.05);
  assert.equal(resultEvent.data.cost, 0.05);
  assert.equal(input.endedSubTasks[0].cost, 0.05);
});

test('charges one Brave Search request', async () =>
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ web: { results: [] }, query: { original: 'test' } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  try
  {
    const result = await new BraveSearchSkill({ apiKey: 'test-key' }).brave_search({ query: 'test' });
    assert.equal(result.cost, 0.005);
  }
  finally
  {
    globalThis.fetch = originalFetch;
  }
});

test('charges both Brave Search requests when news falls back to web', async () =>
{
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async () =>
  {
    requestCount += 1;
    const payload = requestCount === 1
      ? { news: { results: [] }, query: { original: 'test' } }
      : { web: { results: [] }, query: { original: 'test' } };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try
  {
    const result = await new BraveSearchSkill({ apiKey: 'test-key' }).brave_news_search({ query: 'test' });
    assert.equal(requestCount, 2);
    assert.equal(result.cost, 0.01);
  }
  finally
  {
    globalThis.fetch = originalFetch;
  }
});