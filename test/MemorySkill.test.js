import assert from 'node:assert/strict';
import test from 'node:test';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent } from '../src/Agent.js';
import { AgentInput } from '../src/AgentInput.js';
import { AgentAgent } from '../src/app/db/models/AgentAgent.js';
import { AgentMemory } from '../src/app/db/models/AgentMemory.js';
import { AgentStream } from '../src/app/db/models/AgentStream.js';
import { DbManager } from '../src/app/db/DbManager.js';
import { MemorySkill } from '../src/skills/core/MemorySkill.js';
import { TempFileManagerSkill } from '../src/skills/core/TempFileManagerSkill.js';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const embeddingDimensions = 1536;
dotenv.config({ path: path.resolve(testDirectory, '../examples/.env'), quiet: true });

class MemoryTestInput extends AgentInput
{
  constructor()
  {
    super({ source: 'webchat' });
  }
}

function vector(first, second = 0)
{
  const embedding = Array(embeddingDimensions).fill(0);
  embedding[0] = first;
  embedding[1] = second;
  return embedding;
}

function configureDatabase()
{
  const env = process.env;
  DbManager.addDatabase({
    name: env.AGENT_PG_DB,
    host: env.AGENT_PG_HOST,
    port: Number(env.AGENT_PG_PORT),
    database: env.AGENT_PG_DB,
    user: env.AGENT_PG_USER,
    password: env.AGENT_PG_PASSWORD,
    poolSize: Number(env.AGENT_PG_POOL_SIZE),
  });
}

async function createTestAgent(uid, name)
{
  const agent = new AgentAgent();
  agent.uid = uid;
  agent.name = name;
  await agent.save(true);
  return agent;
}

async function deleteTestAgent(uid)
{
  const agent = new AgentAgent();

  try
  {
    await agent.search('"uid" = $1', [uid], { limit: 1 });

    if (!(await agent.next()))
    {
      return;
    }

    const memories = new AgentMemory();

    try
    {
      await memories.search('"agent_uuid" = $1', [agent.uuid]);

      while (await memories.next())
      {
        await memories.delete();
      }
    }
    finally
    {
      memories.close();
    }

    const streams = new AgentStream();

    try
    {
      await streams.search('"agent_uuid" = $1', [agent.uuid]);

      while (await streams.next())
      {
        await streams.delete();
      }
    }
    finally
    {
      streams.close();
    }

    await agent.delete();
  }
  finally
  {
    agent.close();
  }
}

async function findMemory(memoryUid)
{
  const memory = new AgentMemory();

  try
  {
    await memory.search('"uuid" = $1', [memoryUid], { limit: 1 });
    return await memory.next() ? memory : null;
  }
  finally
  {
    if (!memory.uuid)
    {
      memory.close();
    }
  }
}

test('MemorySkill handles global and stream scopes with strict ownership', async () =>
{
  configureDatabase();
  await deleteTestAgent('memory-test-agent');
  await deleteTestAgent('memory-other-agent');
  await createTestAgent('memory-test-agent', 'Memory Test Agent');
  const otherAgent = await createTestAgent('memory-other-agent', 'Memory Other Agent');

  const agent = new Agent({ agentUid: 'memory-test-agent', name: 'Memory Test Agent' });
  const input = new MemoryTestInput();
  const skill = new MemorySkill({ apiKey: 'test-key', model: 'memory-model' });
  const tempFiles = new TempFileManagerSkill();
  const embeddings = new Map([
    ['key-first', vector(1)],
    ['value-opposite', vector(-1)],
    ['key-orthogonal', vector(0, 1)],
    ['value-first', vector(1)],
    ['query-first', vector(1)],
    ['old-one-key', vector(0.8, 0.2)],
    ['old-one-value', vector(0.7, 0.3)],
    ['old-two-key', vector(0.6, 0.4)],
    ['old-two-value', vector(0.5, 0.5)],
    ['new-key', vector(0.9, 0.1)],
    ['new-value', vector(0.9, 0.1)],
    ['foreign-key', vector(0.4, 0.6)],
    ['foreign-value', vector(0.3, 0.7)],
    ['other-agent-key', vector(1)],
    ['other-agent-value', vector(1)],
    ['rejected-key', vector(0.2, 0.8)],
    ['rejected-value', vector(0.1, 0.9)],
  ]);
  const embeddingCalls = [];

  skill.openAIClient.createEmbeddings = async ({ input: texts, model }) =>
  {
    embeddingCalls.push({ texts, model });
    return { model, embeddings: texts.map((text) => embeddings.get(text)) };
  };

  agent.registerInput(input);
  agent.registerSkill(tempFiles);
  agent.registerSkill(skill);
  agent.eventManager = agent.createEventManager();
  await agent.eventManager.load();
  input.addStream('memory-stream-a');
  input.addStream('memory-stream-b');
  const contextA = { agentInput: input, streamId: 'memory-stream-a' };
  const contextB = { agentInput: input, streamId: 'memory-stream-b' };
  await agent.eventManager.resolveStream(input.source, contextA.streamId);
  await agent.eventManager.resolveStream(input.source, contextB.streamId);
  await tempFiles.temp_file_create({
    tempFileName: 'memory/source.txt',
    mimeType: 'text/plain',
    description: 'Memory source file',
    content: 'persistent attachment',
  }, contextA);

  const keyRanked = await skill.memory_memorize({
    key: 'key-first',
    value: 'value-opposite',
    scope: 'global',
    tempFileNames: ['memory/source.txt'],
  }, contextA);
  const valueRanked = await skill.memory_memorize({ key: 'key-orthogonal', value: 'value-first', scope: 'stream' }, contextA);
  assert.match(keyRanked.memoryUid, /^[0-9a-f-]{36}$/i);
  assert.deepEqual(Object.keys(keyRanked), ['memoryUid', 'files']);
  assert.deepEqual(Object.keys(valueRanked), ['memoryUid', 'files']);
  assert.equal(keyRanked.files.length, 1);
  assert.equal(keyRanked.files[0].name, 'memory/source.txt');
  assert.equal(keyRanked.files[0].size, 21);
  const persisted = await findMemory(keyRanked.memoryUid);
  assert.equal(persisted.agentUuid, agent.eventManager.agentUuid);
  assert.equal(persisted.streamUuid, null);
  assert.equal(persisted.embeddingModel, 'memory-model');
  persisted.close();

  const streamA = await agent.eventManager.resolveStream(input.source, contextA.streamId, { create: false });
  const incompatible = new AgentMemory();
  incompatible.agentUuid = agent.eventManager.agentUuid;
  incompatible.streamUuid = streamA.uuid;
  incompatible.key = 'Other model key';
  incompatible.value = 'Other model value';
  incompatible.keyEmbedding = JSON.stringify([1, 0, 0]);
  incompatible.valueEmbedding = JSON.stringify([1, 0, 0]);
  incompatible.embeddingModel = 'other-model';
  await incompatible.save(true);

  const otherStreamMemory = await skill.memory_memorize({ key: 'foreign-key', value: 'foreign-value', scope: 'stream' }, contextB);
  const otherAgentMemory = new AgentMemory();
  otherAgentMemory.agentUuid = otherAgent.uuid;
  otherAgentMemory.streamUuid = null;
  otherAgentMemory.key = 'Other agent key';
  otherAgentMemory.value = 'Other agent value';
  otherAgentMemory.keyEmbedding = JSON.stringify(embeddings.get('other-agent-key'));
  otherAgentMemory.valueEmbedding = JSON.stringify(embeddings.get('other-agent-value'));
  otherAgentMemory.embeddingModel = 'memory-model';
  await otherAgentMemory.save(true);

  const callCountBeforeSearch = embeddingCalls.length;
  const results = await skill.memory_remember({ query: 'query-first', limit: 10 }, contextA);
  assert.equal(embeddingCalls.length, callCountBeforeSearch + 1);
  assert.deepEqual(embeddingCalls.at(-1).texts, ['query-first']);
  assert.deepEqual(results.map(({ memoryUid }) => memoryUid), [keyRanked.memoryUid, valueRanked.memoryUid]);
  assert.equal(results[0].keySimilarity, 1);
  assert.equal(results[0].score, 1);
  assert.equal(results[1].keySimilarity, 0);
  assert.equal(results[1].valueSimilarity, 1);
  assert.equal(results[1].score, 0.85);
  assert.deepEqual(results.map(({ scope }) => scope), ['global', 'stream']);
  assert.equal(results[0].files[0].memoryFileUid, keyRanked.files[0].memoryFileUid);
  assert.ok(results.every(({ embeddingModel }) => embeddingModel === 'memory-model'));
  assert.ok(results.every(({ memoryUid }) => memoryUid !== otherStreamMemory.memoryUid));
  assert.ok(results.every(({ memoryUid }) => memoryUid !== otherAgentMemory.uuid));
  skill.minimumScore = 0.9;
  const thresholdResults = await skill.memory_remember({ query: 'query-first', limit: 10 }, contextA);
  assert.deepEqual(thresholdResults.map(({ memoryUid }) => memoryUid), [keyRanked.memoryUid]);
  skill.minimumScore = 0.45;
  const originalToolValueMaxChar = skill.toolValueMaxChar;
  skill.toolValueMaxChar = JSON.stringify(results[0]).length + 1;
  const limitedResults = await skill.memory_remember({ query: 'query-first', limit: 10 }, contextA);
  assert.deepEqual(limitedResults.map(({ memoryUid }) => memoryUid), [keyRanked.memoryUid]);
  skill.toolValueMaxChar = originalToolValueMaxChar;

  const downloaded = await skill.memory_file_download({ memoryFileUid: keyRanked.files[0].memoryFileUid }, contextA);
  assert.equal(downloaded.success, true);
  assert.equal(downloaded.tempFileName, `memory/${keyRanked.memoryUid}/${keyRanked.files[0].memoryFileUid}/memory/source.txt`);
  assert.equal(await tempFiles.temp_file_read({ tempFileName: downloaded.tempFileName }, contextA), 'persistent attachment');
  await tempFiles.temp_file_remove({ tempFileName: downloaded.tempFileName }, contextA);
  await tempFiles.temp_file_remove({ tempFileName: 'memory/source.txt' }, contextA);

  const oldOne = await skill.memory_memorize({ key: 'old-one-key', value: 'old-one-value', scope: 'global' }, contextA);
  const oldTwo = await skill.memory_memorize({ key: 'old-two-key', value: 'old-two-value', scope: 'stream' }, contextA);
  const replacement = await skill.memory_memorize({
    key: 'new-key',
    value: 'new-value',
    scope: 'global',
    replaceMemoryUids: [oldOne.memoryUid, oldTwo.memoryUid],
  }, contextA);
  assert.equal(await findMemory(oldOne.memoryUid), null);
  assert.equal(await findMemory(oldTwo.memoryUid), null);
  const persistedReplacement = await findMemory(replacement.memoryUid);
  assert.equal(persistedReplacement.embeddingModel, 'memory-model');
  persistedReplacement.close();

  await assert.rejects(skill.memory_memorize({
    key: 'rejected-key',
    value: 'rejected-value',
    scope: 'stream',
    replaceMemoryUids: [otherStreamMemory.memoryUid],
  }, contextA), /accessible to the current agent and stream/);
  const foreignPersisted = await findMemory(otherStreamMemory.memoryUid);
  assert.ok(foreignPersisted);
  foreignPersisted.close();

  const rejectedMemories = new AgentMemory();
  await rejectedMemories.search('"stream_uuid" = $1 AND "key" = $2', [streamA.uuid, 'rejected-key']);
  assert.equal(await rejectedMemories.next(), false);
  rejectedMemories.close();
});

test.after(async () =>
{
  await deleteTestAgent('memory-test-agent');
  await deleteTestAgent('memory-other-agent');
  DbManager.releaseAllConnections();

  if (DbManager._databases.has('agent_smith'))
  {
    await DbManager.removeDatabase('agent_smith');
  }
});