import assert from 'node:assert/strict';
import test from 'node:test';
import { WebChatClient } from '../src/net/client/WebChatClient.js';

test('renews typing until the assistant explicitly stops the task', async (testContext) =>
{
  const requests = [];
  const originalFetch = globalThis.fetch;

  testContext.after(() =>
  {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url, options) =>
  {
    requests.push({ url, body: JSON.parse(options.body) });
    return new Response('', { status: 200 });
  };

  const client = new WebChatClient({ login: 'agent', password: 'password' });
  client.authToken = 'test-token';

  await client.sendTypingStart('stream-a', 40);
  await new Promise((resolve) => setTimeout(resolve, 95));
  await client.sendTypingStop('stream-a');
  await client.stop();

  const typingStates = requests.map((request) => request.body.isTyping);
  assert.equal(typingStates.filter(Boolean).length >= 4, true);
  assert.equal(typingStates.at(-1), false);
});

test('keeps scheduling typing renewals after a transient ping failure', async (testContext) =>
{
  let requestCount = 0;
  const originalFetch = globalThis.fetch;

  testContext.after(() =>
  {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () =>
  {
    requestCount++;

    if (requestCount === 2)
    {
      return new Response('temporary failure', { status: 503 });
    }

    return new Response('', { status: 200 });
  };

  const client = new WebChatClient({ login: 'agent', password: 'password' });
  client.authToken = 'test-token';

  await client.sendTypingStart('stream-a', 40);
  await new Promise((resolve) => setTimeout(resolve, 75));
  await client.sendTypingStop('stream-a');
  await client.stop();

  assert.equal(requestCount >= 4, true);
});