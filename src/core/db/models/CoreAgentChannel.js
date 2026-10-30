/**
 * AppCoreJS Framework
 * GENERATED PROJECT CORE MODEL
 * AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
 * Generated from the project database schema by app-core.
 * This file may be regenerated at any time.
 * Copyright (c) 2026 Bruno Augier
 * Licensed under the MIT License
 */

import { DbObject } from '../../../app/db/DbObject.js';
import { AgentStream } from '../../../app/db/models/AgentStream.js';

export class CoreAgentChannel extends DbObject
{
    _uuid;
    _uid;
    _name;
    _createdAt;
    _updatedAt;
    __uuid;
    __uid;
    __name;
    __createdAt;
    __updatedAt;


    constructor(connectionUid = null)
    {
        super(connectionUid);

        this._databaseName = 'agent_smith';
        this._schema = 'public';
        this._tableName = 'channel';

        this._fields =
        {
           uuid:
                {
                    columnName: "uuid",
                    attributeName: "_uuid",
                    isPrimaryKey: true,
                    dataType: "uuid",
                    isNullable: false,
                    defaultValue: "gen_random_uuid()",
                    foreignKey: null
                },
           uid:
                {
                    columnName: "uid",
                    attributeName: "_uid",
                    isPrimaryKey: false,
                    dataType: "text",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: null
                },
           name:
                {
                    columnName: "name",
                    attributeName: "_name",
                    isPrimaryKey: false,
                    dataType: "text",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: null
                },
           created_at:
                {
                    columnName: "created_at",
                    attributeName: "_createdAt",
                    isPrimaryKey: false,
                    dataType: "timestamp with time zone",
                    isNullable: false,
                    defaultValue: "now()",
                    foreignKey: null
                },
           updated_at:
                {
                    columnName: "updated_at",
                    attributeName: "_updatedAt",
                    isPrimaryKey: false,
                    dataType: "timestamp with time zone",
                    isNullable: false,
                    defaultValue: "now()",
                    foreignKey: null
                }
        };


        this._primaryKeys = ['uuid'];


        this._uuid = null;
        this.__uuid = null;

        this._uid = null;
        this.__uid = null;

        this._name = null;
        this.__name = null;

        this._createdAt = null;
        this.__createdAt = null;

        this._updatedAt = null;
        this.__updatedAt = null;

    }

    get uuid()
    {
        return this._uuid;
    }

    set uuid(uuid)
    {
        this._uuid = uuid;
    }

    get uid()
    {
        return this._uid;
    }

    set uid(uid)
    {
        this._uid = uid;
    }

    get name()
    {
        return this._name;
    }

    set name(name)
    {
        this._name = name;
    }

    get createdAt()
    {
        return this._createdAt;
    }

    set createdAt(createdAt)
    {
        this._createdAt = createdAt;
    }

    get updatedAt()
    {
        return this._updatedAt;
    }

    set updatedAt(updatedAt)
    {
        this._updatedAt = updatedAt;
    }

    async getAgentStreams()
    {
        const streams = new AgentStream(this._connectionUid);
        const found = await streams.search('"channel_uuid" = $1', [this.uuid]);
        if(!found)
        {
            return null;
        }        
        return streams;
    }

}