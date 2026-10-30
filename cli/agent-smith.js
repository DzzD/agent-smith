#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DbManager } from '../src/app/db/DbManager.js';
import { AgentListCommand } from './commands/agent/AgentListCommand.js';
import { AgentShowCommand } from './commands/agent/AgentShowCommand.js';
import { AgentAddCommand } from './commands/agent/AgentAddCommand.js';
import { AgentUpdateCommand } from './commands/agent/AgentUpdateCommand.js';
import { MemoryReembedCommand } from './commands/memory/MemoryReembedCommand.js';
import { EventReembedCommand } from './commands/event/EventReembedCommand.js';

function printUsage()
{
  console.log('Usage: agent-smith agent <list|show|add|update> [options]');
  console.log('  agent-smith agent list');
  console.log('  agent-smith agent show --uid smith');
  console.log('  agent-smith agent add --uid smith --name "Agent Smith"');
  console.log('  agent-smith agent update --uid smith --name "New name"');
  console.log('  agent-smith memory reembed [--from-model <model>]');
  console.log('  agent-smith event reembed [--from-model <model>] [--max-rpm <requests>] [--batch <size>]');
}

function resolveCommand(group, action)
{
  if (group === 'event')
  {
    return { reembed: EventReembedCommand }[action] ?? null;
  }

  if (group === 'memory')
  {
    return { reembed: MemoryReembedCommand }[action] ?? null;
  }

  if (group !== 'agent')
  {
    return null;
  }

  return {
    list: AgentListCommand,
    show: AgentShowCommand,
    add: AgentAddCommand,
    update: AgentUpdateCommand,
  }[action] ?? null;
}

function configureDatabase()
{
  const cliDirectory = path.dirname(fileURLToPath(import.meta.url));
  dotenv.config({ path: path.resolve(cliDirectory, '../examples/.env'), quiet: true });
  const env = process.env;
  const database = String(env.AGENT_PG_DB ?? '').trim();

  if (!database)
  {
    throw new Error('Missing PostgreSQL configuration in examples/.env.');
  }

  DbManager.addDatabase({
    name: database,
    host: env.AGENT_PG_HOST,
    port: Number(env.AGENT_PG_PORT),
    user: env.AGENT_PG_USER,
    password: env.AGENT_PG_PASSWORD,
    database,
    poolSize: Number(env.AGENT_PG_POOL_SIZE ?? 20),
  });

  return database;
}

async function runCli(argv = process.argv.slice(2))
{
  const Command = resolveCommand(String(argv[0] ?? '').trim(), String(argv[1] ?? '').trim());
  let database = null;

  if (!Command)
  {
    printUsage();
    process.exitCode = 1;
    return;
  }

  try
  {
    database = configureDatabase();
    await new Command().run(argv.slice(2));
  }
  catch (error)
  {
    const code = String(error?.originalError?.originalError?.code ?? error?.originalError?.code ?? error?.code ?? '');

    if (code === '23505')
    {
      console.error('Operation failed: duplicate agent uid.');
    }
    else if (String(error?.message ?? '').startsWith('missing_required_option:'))
    {
      console.error(`Missing required option: --${String(error.message).split(':')[1]}`);
      printUsage();
    }
    else
    {
      console.error(error?.message ?? String(error));
    }

    process.exitCode = 1;
  }
  finally
  {
    DbManager.releaseAllConnections();

    if (database && DbManager._databases.has(database))
    {
      await DbManager.removeDatabase(database);
    }
  }
}

await runCli();