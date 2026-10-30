/**
 * AppCoreJS Framework
 * CORE LAYER
 * NOT INTENDED TO BE MODIFIED IN APPLICATION PROJECTS
 * Copyright (c) 2026 Bruno Augier
 * Licensed under the MIT License
 */

import { Pool } from 'pg';
import util from 'node:util';
import { DbConnector } from '../../app/db/DbConnector.js';
import { DbManager } from '../../app/db/DbManager.js';

export class CoreDbManager
{
    static _databases = new Map();
    static _connections = new Map();

    static [util.inspect.custom]()
    {
        const databases = Array.from(DbManager._databases.keys());
        const connections = {};

        Array.from(DbManager._connections.values()).forEach((connection) =>
        {
            connections[connection.connectionUid] =
            {
                database: connection.database.config.database,
                transaction: !!connection.transactionClient
            };
        });

        return {
            databases,
            connections
        };
    }

    static addDatabase(config)
    {
        const name = config.name ?? config.database;
        const database = DbManager._databases.get(name);

        if (database)
        {
            throw new Error(`Base de données déjà existante ${name}`);
        }

        const poolSize = config.poolSize ?? 50;
        const poolConfig = { ...config, max: poolSize };

        delete poolConfig.name;
        delete poolConfig.poolSize;

        const pool = new Pool(poolConfig);

        DbManager._databases.set(name,
        {
            name,
            config,
            pool
        });
    }

    static async getClient(databaseName = null, connectionUid = "default")
    {
        databaseName = databaseName ?? DbManager._getFirstDatabaseName();

        const database = DbManager._databases.get(databaseName);

        if (!database)
        {
            throw new Error(`Base de données manquante ${databaseName}`);
        }

        let connection = DbManager._connections.get(connectionUid);

        if (connection)
        {
            if (connection.database !== database)
            {
                throw new Error(`Mixed client, connection ${connectionUid}, database ${databaseName}`);
            }

            return connection;
        }

        connection =
        {
            database,
            connectionUid,
            transactionClient: null,

            async query(sql, params = [])
            {
                if (this.transactionClient)
                {
                    return await this.transactionClient.query(sql, params);
                }

                return await this.database.pool.query(sql, params);
            },

            async begin()
            {
                if (this.transactionClient)
                {
                    throw new Error(`Transaction déjà ouverte ${this.connectionUid}`);
                }

                this.transactionClient = await this.database.pool.connect();
                await this.transactionClient.query('BEGIN');
            },

            async commit()
            {
                if (!this.transactionClient)
                {
                    throw new Error(`Aucune transaction ouverte ${this.connectionUid}`);
                }

                try
                {
                    await this.transactionClient.query('COMMIT');
                }
                finally
                {
                    this.transactionClient.release();
                    this.transactionClient = null;
                }
            },

            async rollback()
            {
                if (!this.transactionClient)
                {
                    throw new Error(`Aucune transaction ouverte ${this.connectionUid}`);
                }

                try
                {
                    await this.transactionClient.query('ROLLBACK');
                }
                finally
                {
                    this.transactionClient.release();
                    this.transactionClient = null;
                }
            },

            release()
            {
                if (this.transactionClient)
                {
                    this.transactionClient.release();
                    this.transactionClient = null;
                }
            }
        };

        DbManager._connections.set(connectionUid, connection);

        return connection;
    }

    static releaseConnection(connectionUid = "default")
    {
        const connection = DbManager._connections.get(connectionUid);

        if (!connection)
        {
            return;
        }

        connection.release();
        DbManager._connections.delete(connectionUid);
    }

    static releaseAllConnections()
    {
        Array.from(DbManager._connections.keys()).forEach((connectionUid) =>
        {
            DbManager.releaseConnection(connectionUid);
        });
    }

    static async removeDatabase(databaseName)
    {
        const database = DbManager._databases.get(databaseName ?? DbManager._getFirstDatabaseName());

        Array.from(DbManager._connections.values()).forEach((connection) =>
        {
            if (connection.database === database)
            {
                DbManager.releaseConnection(connection.connectionUid);
            }
        });

        await database.pool.end();
        DbManager._databases.delete(databaseName);
    }

    static getConnector(databaseName = null, connectionUid = "default")
    {
        const resolvedDatabaseName = databaseName ?? DbManager._getFirstDatabaseName();
        const info = DbManager._databases.get(resolvedDatabaseName);

        if (!info)
        {
            throw new Error(`Base de données manquante ${resolvedDatabaseName}`);
        }

        const connector = new DbConnector();
        connector.databaseName = resolvedDatabaseName;
        connector._connectionUid = connectionUid;

        return connector;
    }

    static _getFirstDatabaseName()
    {
        const firstDatabaseEntry = CoreDbManager._databases.keys().next();

        return firstDatabaseEntry.value;
    }
}