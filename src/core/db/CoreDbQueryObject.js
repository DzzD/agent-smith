/**
 * AppCoreJS Framework
 * CORE LAYER
 * NOT INTENDED TO BE MODIFIED IN APPLICATION PROJECTS
 * Copyright (c) 2026 Bruno Augier
 * Licensed under the MIT License
 */

import { Error } from '../../app/Error.js';
import { DbManager } from '../../app/db/DbManager.js';


export class CoreDbQueryObject
{
    _databaseName;
    _connectionUid;
    _searchConnector;
    _query;
    _dbObjects;

    constructor(databaseName, connectionUid = "default")
    {
        if (!databaseName)
        {
            throw new Error('CoreDbQueryObject requiert un nom de base de données.');
        }

        this._databaseName = databaseName;
        this._connectionUid = connectionUid;
        this._searchConnector = null;
        this._query = null;
        this._dbObjects = new Map();
    }


    async search(where = null, params = [], { limit = null, order = null } = {})
    {
        if (!this._searchConnector)
        {
            this._searchConnector = DbManager.getConnector(this._databaseName, this._connectionUid);

            for (const meta of this._dbObjects.values())
            {
                meta.instance._searchConnector = this._searchConnector;
                this._searchConnector.linkTo(meta.instance, meta.alias);
            }
        }

        let sql = `SELECT * FROM (${this._query}) as result`;

        if (where)
        {
            sql += ' WHERE ' + where;
        }

        if (order)
        {
            sql += ' ORDER BY ' + order;
        }

        if (limit != null)
        {
            sql += ' LIMIT ' + limit;
        }

        await this._searchConnector.query(sql, params);

        return this;
    }


    addDbObject(ClassRef, objectName = null, alias = null)
    {
        if (!ClassRef)
        {
            return null;
        }

        const key = objectName ?? alias ?? ClassRef.name;
        const instance = new ClassRef(this._connectionUid);

        const meta =
        {
            ClassRef,
            alias,
            instance
        };

        if (this._searchConnector)
        {
            instance._searchConnector = this._searchConnector;
            this._searchConnector.linkTo(instance, alias);
        }

        this._dbObjects.set(key, meta);

        Object.defineProperty(this, key,
        {
            get: () => this.getDbObject(key),
            configurable: true
        });

        return key;
    }


    getDbObject(key)
    {
        return this._dbObjects.get(key)?.instance ?? null;
    }


    async next()
    {
        if (!this._searchConnector)
        {
            return null;
        }

        return this._searchConnector.next();
    }


    recordCount()
    {
        if (!this._searchConnector)
        {
            return 0;
        }

        return this._searchConnector.recordCount();
    }


    async recordCountAll(where = null, params = [])
    {
        const connector = DbManager.getConnector(this._databaseName, this._connectionUid);

        let sql = `SELECT COUNT(*) AS nb FROM (${this._query}) as result`;

        if (where)
        {
            sql += ' WHERE ' + where;
        }

        await connector.query(sql, params);

        if (await connector.next())
        {
            const count = connector.getFieldValue('nb') ?? 0;

            connector.close();

            return Number(count);
        }

        return 0;
    }


    getFieldValue(name, alias = null)
    {
        return this._searchConnector?.getFieldValue(name, alias) ?? null;
    }


    close()
    {
        if (!this._searchConnector)
        {
            return;
        }

        this._searchConnector.close();
        this._searchConnector = null;

        for (const meta of this._dbObjects.values())
        {
            meta.instance._searchConnector = null;
        }
    }
}