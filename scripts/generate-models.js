import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, [
    'node_modules/app-core/bin/app-core.js',
    '--project', 'agent',
    '--target', 'src',
    '--model',
    '--dbhost', process.env.AGENT_PG_HOST,
    '--dbport', process.env.AGENT_PG_PORT,
    '--dbuser', process.env.AGENT_PG_USER,
    '--dbpassword', process.env.AGENT_PG_PASSWORD,
    '--dbname', process.env.AGENT_PG_DB,
    '--dbschema', process.env.AGENT_PG_SCHEMA,
    '--model-prefix', 'agent'
], { stdio: 'inherit' });

if (result.error)
{
    throw result.error;
}

process.exitCode = result.status;