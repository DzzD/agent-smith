import assert from 'node:assert/strict';
import test from 'node:test';
import { AgentEventManager } from '../src/AgentEventManager.js';

test('keeps WebChat send error messages in the agent prompt', () =>
{
  const eventManager = new AgentEventManager({});
  const messages = eventManager.buildEventsPrompt([
    {
      type: 'tool_call',
      data: [{ call_id: 'send-call', name: 'send_webchat_message', arguments: '{}' }],
    },
    {
      type: 'tool_result',
      data: {
        call_id: 'send-call',
        name: 'send_webchat_message',
        durationMs: 8,
        result: {
          ok: false,
          error: {
            type: 'tool_execution_error',
            message: 'WebChat rejected the message payload.',
          },
        },
      },
    },
  ]);

  assert.equal(messages[1].role, 'tool');
  assert.deepEqual(JSON.parse(messages[1].content), {
    type: 'tool_execution_error',
    message: 'WebChat rejected the message payload.',
    durationMs: 8,
  });
});