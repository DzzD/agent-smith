import assert from 'node:assert/strict';
import test from 'node:test';
import { Agent } from '../src/Agent.js';
import { AgentInput } from '../src/AgentInput.js';

class RuntimeTestAgent extends Agent
{
  constructor()
  {
    super({ agentUid: 'runtime-test' });
    this.processed = [];
  }

  async runTask({ agentInput, streamId })
  {
    this.processed.push(`${agentInput.source}:${streamId}`);
  }
}

class RuntimeTestInput extends AgentInput
{
  constructor(source)
  {
    super({ source });
  }
}

test('isolates equal stream ids across channels', async () =>
{
  const agent = new RuntimeTestAgent();
  const matrix = new RuntimeTestInput('matrix');
  const webchat = new RuntimeTestInput('webchat');
  agent.registerInput(matrix);
  agent.registerInput(webchat);

  matrix.addStream('same-id');
  webchat.addStream('same-id');
  agent.pendingStreams.add(agent.getStreamKey(matrix, 'same-id'));
  agent.pendingStreams.add(agent.getStreamKey(webchat, 'same-id'));

  await Promise.all([
    agent.processPendingStream(matrix, 'same-id'),
    agent.processPendingStream(webchat, 'same-id'),
  ]);

  assert.deepEqual(new Set(agent.processed), new Set(['matrix:same-id', 'webchat:same-id']));
});

