import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const databaseDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationDirectory = path.join(databaseDirectory, 'init');
const migrationFilePattern = /^(\d+)-.+\.sql$/;
const metadataTableName = 'database_metadata';
const databaseVersionCode = 'version_db';
const metadataMigrationVersion = 10;
const migrationLockId = 193748521;

function splitSqlStatements(sql)
{
    const statements = [];
    let statementStart = 0;
    let quote = null;
    let dollarQuote = null;
    let inLineComment = false;
    let inBlockComment = false;

    for (let index = 0; index < sql.length; index++)
    {
        const character = sql[index];
        const nextCharacter = sql[index + 1];

        if (inLineComment)
        {
            if (character === '\n') inLineComment = false;
            continue;
        }

        if (inBlockComment)
        {
            if (character === '*' && nextCharacter === '/')
            {
                inBlockComment = false;
                index++;
            }
            continue;
        }

        if (dollarQuote)
        {
            if (sql.startsWith(dollarQuote, index))
            {
                index += dollarQuote.length - 1;
                dollarQuote = null;
            }
            continue;
        }

        if (quote)
        {
            if (character === quote)
            {
                if (nextCharacter === quote)
                {
                    index++;
                }
                else
                {
                    quote = null;
                }
            }
            continue;
        }

        if (character === '-' && nextCharacter === '-')
        {
            inLineComment = true;
            index++;
            continue;
        }

        if (character === '/' && nextCharacter === '*')
        {
            inBlockComment = true;
            index++;
            continue;
        }

        if (character === '\'' || character === '"')
        {
            quote = character;
            continue;
        }

        if (character === '$')
        {
            const match = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(index));

            if (match)
            {
                dollarQuote = match[0];
                index += dollarQuote.length - 1;
                continue;
            }
        }

        if (character === ';')
        {
            const statement = sql.slice(statementStart, index + 1).trim();
            if (statement) statements.push(statement);
            statementStart = index + 1;
        }
    }

    if (quote || dollarQuote || inBlockComment)
    {
        throw new Error('Unterminated SQL quote or comment');
    }

    const finalStatement = sql.slice(statementStart).trim();
    if (finalStatement) statements.push(finalStatement);

    return statements;
}

function getDatabaseConfig()
{
    const config =
    {
        host: String(process.env.AGENT_PG_HOST ?? '').trim(),
        port: Number(process.env.AGENT_PG_PORT ?? 5433),
        user: String(process.env.AGENT_PG_USER ?? '').trim(),
        password: String(process.env.AGENT_PG_PASSWORD ?? ''),
        database: String(process.env.AGENT_PG_DB ?? '').trim()
    };

    const missingVariables = [];

    if (!config.host) missingVariables.push('AGENT_PG_HOST');
    if (!config.user) missingVariables.push('AGENT_PG_USER');
    if (!config.database) missingVariables.push('AGENT_PG_DB');
    if (!Number.isInteger(config.port) || config.port <= 0) missingVariables.push('AGENT_PG_PORT');

    if (missingVariables.length > 0)
    {
        throw new Error(`Missing or invalid database configuration: ${missingVariables.join(', ')}`);
    }

    return config;
}

async function getMigrations()
{
    const fileNames = await readdir(migrationDirectory);
    const migrations = fileNames.flatMap((fileName) =>
    {
        const match = migrationFilePattern.exec(fileName);
        return match ? [{ version: Number(match[1]), fileName }] : [];
    }).sort((left, right) => left.version - right.version);

    for (let index = 0; index < migrations.length; index++)
    {
        const migration = migrations[index];
        const expectedVersion = index + 1;

        if (migration.version !== expectedVersion)
        {
            throw new Error(`Expected migration version ${expectedVersion}, found ${migration.fileName}`);
        }
    }

    return migrations;
}

async function getCurrentVersion(client)
{
    const tableResult = await client.query('SELECT to_regclass($1) AS table_name', [`public.${metadataTableName}`]);

    if (!tableResult.rows[0].table_name)
    {
        return getLegacyVersion(client);
    }

    const versionResult = await client.query(`SELECT value FROM ${metadataTableName} WHERE code = $1`, [databaseVersionCode]);

    if (versionResult.rowCount === 0)
    {
        throw new Error(`Missing ${databaseVersionCode} in ${metadataTableName}`);
    }

    const version = Number(versionResult.rows[0].value);

    if (!Number.isInteger(version) || version < 0)
    {
        throw new Error(`Invalid database version: ${versionResult.rows[0].value}`);
    }

    return version;
}

async function getLegacyVersion(client)
{
    const tableResult = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('agent', 'file', 'memory', 'memory_file')
    `);
    const tables = new Set(tableResult.rows.map(({ table_name: tableName }) => tableName));

    if (!tables.has('agent')) return 0;

    const columnResult = await client.query(`
        SELECT table_name, column_name, is_nullable, ordinal_position
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('event', 'file', 'memory')
    `);
    const columns = new Map(columnResult.rows.map((column) => [`${column.table_name}.${column.column_name}`, column]));

    if (columns.has('event.embedding') && columns.has('event.embedding_model')) return 9;
    if (tables.has('memory_file')) return 8;
    if (tables.has('memory') && columns.get('memory.stream_uuid')?.is_nullable === 'YES') return 7;
    if (tables.has('memory')) return 6;

    const eventUuidPosition = columns.get('file.event_uuid')?.ordinal_position;
    const namePosition = columns.get('file.name')?.ordinal_position;

    if (eventUuidPosition && namePosition && eventUuidPosition < namePosition) return 5;
    if (columns.get('event.type')?.is_nullable === 'NO') return 4;
    if (columns.has('file.event_uuid') && columns.has('file.active')) return 3;
    if (columns.has('file.agent_uuid') && columns.get('file.stream_uuid')?.is_nullable === 'YES') return 2;
    if (tables.has('file')) return 1;

    throw new Error('Cannot determine the version of this legacy Agent Smith database safely');
}

async function updateDatabase()
{
    const migrations = await getMigrations();
    const client = new Client(getDatabaseConfig());
    let lockAcquired = false;

    await client.connect();

    try
    {
        await client.query('SELECT pg_advisory_lock($1)', [migrationLockId]);
        lockAcquired = true;

        const currentVersion = await getCurrentVersion(client);
        const latestVersion = migrations.at(-1)?.version ?? 0;

        if (currentVersion > latestVersion)
        {
            throw new Error(`Database version ${currentVersion} is newer than available migration version ${latestVersion}`);
        }

        const pendingMigrations = migrations.filter((migration) => migration.version > currentVersion);

        for (const migration of pendingMigrations)
        {
            console.log(`Applying migration ${migration.fileName}`);
            const sql = await readFile(path.join(migrationDirectory, migration.fileName), 'utf8');

            for (const statement of splitSqlStatements(sql))
            {
                await client.query(statement);
            }

            if (migration.version >= metadataMigrationVersion)
            {
                await client.query(
                    `INSERT INTO ${metadataTableName} (code, value) VALUES ($1, $2) ON CONFLICT (code) DO UPDATE SET value = EXCLUDED.value`,
                    [databaseVersionCode, String(migration.version)]
                );
            }
        }

        console.log(`Database is up to date at version ${latestVersion}`);
    }
    finally
    {
        try
        {
            if (lockAcquired) await client.query('SELECT pg_advisory_unlock($1)', [migrationLockId]);
        }
        finally
        {
            await client.end();
        }
    }
}

await updateDatabase();