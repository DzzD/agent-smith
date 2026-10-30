import assert from 'node:assert/strict';
import test from 'node:test';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent } from '../src/Agent.js';
import { AgentInput } from '../src/AgentInput.js';
import { AgentAgent } from '../src/app/db/models/AgentAgent.js';
import { AgentEvent } from '../src/app/db/models/AgentEvent.js';
import { AgentFile } from '../src/app/db/models/AgentFile.js';
import { AgentStream } from '../src/app/db/models/AgentStream.js';
import { DbQueryAgentFiles } from '../src/app/db/queries/DbQueryAgentFiles.js';
import { DbManager } from '../src/app/db/DbManager.js';
import { TempFileManagerSkill } from '../src/skills/core/TempFileManagerSkill.js';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(testDirectory, '../examples/.env'), quiet: true });

class TestInput extends AgentInput
{
  constructor()
  {
    super({ source: 'webchat' });
  }
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

async function ensureTestAgent()
{
  const agent = new AgentAgent();

  try
  {
    await agent.search('"uid" = $1', ['test-agent'], { limit: 1 });

    if (await agent.next())
    {
      return;
    }
  }
  finally
  {
    agent.close();
  }

  const createdAgent = new AgentAgent();
  createdAgent.uid = 'test-agent';
  createdAgent.name = 'Test Agent';
  await createdAgent.save(true);
}

async function cleanTestAgent()
{
  const agent = new AgentAgent();

  try
  {
    await agent.search('"uid" = $1', ['test-agent'], { limit: 1 });

    if (!(await agent.next()))
    {
      return;
    }

    const files = new AgentFile();

    try
    {
      await files.search('"agent_uuid" = $1', [agent.uuid]);

      while (await files.next())
      {
        await files.delete();
      }
    }
    finally
    {
      files.close();
    }

    const streams = new AgentStream();

    try
    {
      await streams.search('"agent_uuid" = $1', [agent.uuid]);

      while (await streams.next())
      {
        const events = new AgentEvent();

        try
        {
          await events.search('"stream_uuid" = $1', [streams.uuid]);

          while (await events.next())
          {
            await events.delete();
          }
        }
        finally
        {
          events.close();
        }

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

test('persists events and temp files through AppCore', async () =>
{
  configureDatabase();
  const agent = new Agent({ agentUid: 'test-agent', name: 'Test Agent' });
  const input = new TestInput();
  const files = new TempFileManagerSkill();
  agent.registerInput(input);
  agent.registerSkill(files);
  input.addStream('integration-stream');

  await ensureTestAgent();
  agent.eventManager = agent.createEventManager();
  await agent.eventManager.load();

  const event = await input.pushEvent({ streamId: 'integration-stream', type: 'input_message', data: 'hello' });
  assert.match(event.uuid, /^[0-9a-f-]{36}$/i);

  const events = await agent.eventManager.getLastEvents('webchat', 'integration-stream');
  assert.equal(events.at(-1).data, 'hello');

  await files.temp_file_remove({ tempFileName: 'notes/test.txt' }, { agentInput: input, streamId: 'integration-stream' }).catch(() => {});
  await files.temp_file_remove({ tempFileName: 'notes/second.txt' }, { agentInput: input, streamId: 'integration-stream' }).catch(() => {});
  await files.temp_file_create({ tempFileName: 'notes/test.txt', content: 'hello' }, { agentInput: input, streamId: 'integration-stream' });
  await files.temp_file_create({ tempFileName: 'notes/second.txt', content: 'second' }, { agentInput: input, streamId: 'integration-stream' });
  await files.temp_file_insert({ tempFileName: 'notes/test.txt', content: ' world', startLine: null }, { agentInput: input, streamId: 'integration-stream' });
  assert.equal(await files.temp_file_read({ tempFileName: 'notes/test.txt' }, { agentInput: input, streamId: 'integration-stream' }), 'hello world');

  await files.createFile({
    streamId: 'integration-stream',
    tempFileName: 'notes/disguised.json',
    mimeType: 'image/png',
    description: 'PNG with a misleading extension',
    permanent: false,
    data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]),
  }, { agentInput: input });
  const binaryPreview = await files.temp_file_read(
    { tempFileName: 'notes/disguised.json' },
    { agentInput: input, streamId: 'integration-stream' }
  );
  assert.equal(binaryPreview, 'Binary data preview:\n89 50 4E 47 0D 0A 1A 0A 00 00 00 0D 49 48 44 52\nASCII: .PNG........IHDR');
  assert.equal(binaryPreview.includes('\0'), false);
  assert.deepEqual(
    [...await files.getFiles('integration-stream', { agentInput: input })].map(([name]) => name),
    ['notes/disguised.json', 'notes/second.txt', 'notes/test.txt']
  );

  const globalFileName = `global/listing-${Date.now()}.txt`;
  await files.createFile({
    streamId: Agent.GLOBAL_STREAM_ID,
    tempFileName: globalFileName,
    mimeType: 'text/plain',
    description: 'Global listing test',
    owner: null,
    permanent: false,
    data: Buffer.from('global'),
  });

  const globalFiles = await files.getFiles(Agent.GLOBAL_STREAM_ID);
  assert.ok(globalFiles.has(globalFileName));
  const readableFiles = await files._getReadableFiles('integration-stream', { agentInput: input });
  assert.ok(readableFiles.has(globalFileName));
  const listedFiles = JSON.parse(await files.temp_file_list({ name: globalFileName }, { agentInput: input, streamId: 'integration-stream' }));
  assert.deepEqual(listedFiles.files.map((file) => file.tempFileName), [globalFileName]);
  assert.equal(files.processToolData('temp_file_list'), false);

  const stream = await agent.eventManager.resolveStream('webchat', 'integration-stream');
  const metadataQuery = new DbQueryAgentFiles();
  await metadataQuery.search('"stream_uuid" = $1 AND "name" = $2', [stream.uuid, 'notes/test.txt'], { limit: 1 });
  assert.ok(await metadataQuery.next());
  assert.equal(metadataQuery.file.data, undefined);
  assert.equal(metadataQuery.size, 11);
  metadataQuery.close();

  await assert.rejects(agent.eventManager.resolveStream('unknown', 'integration-stream'), /Unknown channel uid/);

  const concurrentStreams = await Promise.all([
    agent.eventManager.resolveStream('webchat', 'concurrent-stream'),
    agent.eventManager.resolveStream('webchat', 'concurrent-stream'),
  ]);
  assert.equal(concurrentStreams[0].uuid, concurrentStreams[1].uuid);

  const persistedEvent = new AgentEvent();
  await persistedEvent.search('"uuid" = $1', [event.uuid], { limit: 1 });
  assert.equal(await persistedEvent.next(), true);
  persistedEvent.close();

  const rejectedEvent = await input.pushEvent({
    streamId: 'integration-stream',
    type: 'tool_result',
    data: { call_id: 'nul-call', name: 'temp_file_read', result: 'unsafe\0result' },
  });
  assert.equal(rejectedEvent.type, 'rejected_event');
  assert.deepEqual(rejectedEvent.data, {
    rejectedType: 'tool_result',
    cause: 'Event data contains a NUL character unsupported by PostgreSQL JSONB',
    toolName: 'temp_file_read',
    callId: 'nul-call',
  });

  const rejectedEvents = await agent.eventManager.getLastEvents('webchat', 'integration-stream');
  assert.equal(rejectedEvents.at(-1).type, 'rejected_event');
  assert.equal(JSON.stringify(rejectedEvents.at(-1)).includes('\0'), false);
  const rejectedPrompt = agent.eventManager.buildEventsPrompt([{
    type: 'tool_call',
    data: [{ call_id: 'nul-call', name: 'temp_file_read', arguments: '{}' }],
  }, rejectedEvent]);
  assert.equal(rejectedPrompt[1].role, 'tool');
  assert.equal(rejectedPrompt[1].tool_call_id, 'nul-call');
  assert.equal(rejectedPrompt[1].content, 'Event data contains a NUL character unsupported by PostgreSQL JSONB');
  const eventAfterRejection = await input.pushEvent({ streamId: 'integration-stream', type: 'input_message', data: 'task continues' });
  assert.match(eventAfterRejection.uuid, /^[0-9a-f-]{36}$/i);

  const compressionStreamId = `compression-${Date.now()}`;
  await input.pushEvent({ streamId: compressionStreamId, type: 'input_message', data: 'old message' });
  const protectedCall = await input.pushEvent({
    streamId: compressionStreamId,
    type: 'tool_call',
    data: [{ call_id: 'protected-call', name: 'protected_tool', arguments: {} }],
  });
  const protectedResult = await input.pushEvent({
    streamId: compressionStreamId,
    type: 'tool_result',
    data: { call_id: 'protected-call', name: 'protected_tool', result: 'sent' },
  });
  const newMessage = await input.pushEvent({ streamId: compressionStreamId, type: 'input_message', data: 'new message' });

  agent.findSkillByToolName = (toolName) => toolName === 'protected_tool' ? { keepToolCallsOnCompression: true } : null;
  agent.buildModelTools = () => [];
  agent.openAIClient = {
    buildRequest: (request) => request,
    serializeContextForTokenEstimate: (request) => JSON.stringify(request),
  };
  agent.getContext = async (streamId, prompt = null) => ({
    systemPrompt: '',
    userPrompt: prompt ?? await agent.eventManager.buildStreamEventsPrompt('webchat', streamId),
    loadedSkillNames: new Set(),
  });

  const protectedContext = agent.eventManager.buildEventsPrompt([protectedCall, protectedResult, newMessage]);
  const protectedTargetSize = JSON.stringify({ instructions: '', input: protectedContext, tools: [] }).length;
  await agent.eventManager.compressStream('webchat', compressionStreamId, protectedTargetSize);
  const activeCompressionEvents = await agent.eventManager.getEvents('webchat', compressionStreamId);
  assert.deepEqual(activeCompressionEvents.map(({ uuid }) => uuid), [protectedCall.uuid, protectedResult.uuid, newMessage.uuid]);

  await agent.eventManager.compressStream('webchat', compressionStreamId, 1);
  const fullyCompressedEvents = await agent.eventManager.getEvents('webchat', compressionStreamId);
  assert.deepEqual(fullyCompressedEvents, []);
  const completeCompressionHistory = await agent.eventManager.getEvents('webchat', compressionStreamId, { activeOnly: false });
  assert.equal(completeCompressionHistory.length, 4);
});

test.after(async () =>
{
  await cleanTestAgent();
  DbManager.releaseAllConnections();

  if (DbManager._databases.has('agent'))
  {
    await DbManager.removeDatabase('agent');
  }
});