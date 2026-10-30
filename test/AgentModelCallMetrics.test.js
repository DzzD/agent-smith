import assert from 'node:assert/strict';
import test from 'node:test';
import { Agent } from '../src/Agent.js';

test('Agent extracts prompt cache and reasoning metrics from chat completion usage', () =>
{
  assert.deepEqual(Agent.getModelCallMetrics({
    usage: {
      prompt_tokens: 1000,
      prompt_tokens_details: { cached_tokens: 750 },
      completion_tokens: 250,
      completion_tokens_details: { reasoning_tokens: 128 },
    },
  }), {
    promptTokens: 1000,
    cachedPromptTokens: 750,
    outputTokens: 250,
    cachePercent: '75.0',
    hasReasoning: true,
    reasoningTokens: 128,
  });
});

test('Agent supports response usage aliases and reasoning content', () =>
{
  assert.deepEqual(Agent.getModelCallMetrics({
    usage: {
      input_tokens: 400,
      input_tokens_details: { cached_tokens: 100 },
      output_tokens: 80,
      output_tokens_details: { reasoning_tokens: 0 },
    },
    choices: [{ message: { reasoning_content: 'Internal reasoning' } }],
  }), {
    promptTokens: 400,
    cachedPromptTokens: 100,
    outputTokens: 80,
    cachePercent: '25.0',
    hasReasoning: true,
    reasoningTokens: 0,
  });

  assert.deepEqual(Agent.getModelCallMetrics({}), {
    promptTokens: null,
    cachedPromptTokens: null,
    outputTokens: null,
    cachePercent: null,
    hasReasoning: false,
    reasoningTokens: null,
  });

  assert.deepEqual(Agent.getModelCallMetrics({
    usage: {
      prompt_tokens: 0,
      prompt_tokens_details: { cached_tokens: 0 },
      completion_tokens: 0,
      completion_tokens_details: { reasoning_tokens: 0 },
    },
  }), {
    promptTokens: 0,
    cachedPromptTokens: 0,
    outputTokens: 0,
    cachePercent: '0.0',
    hasReasoning: false,
    reasoningTokens: 0,
  });
});

test('Agent propagates the chat completion streaming option', () =>
{
  const agent = new Agent({ openAIStream: true });

  assert.equal(agent.createOpenAIClient().stream, true);
});