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
import { AgentFile } from '../../../app/db/models/AgentFile.js';

export class CoreAgentEvent extends DbObject
{
    _uuid;
    _streamUuid;
    _sequence;
    _data;
    _active;
    _createdAt;
    _updatedAt;
    _type;
    _embedding;
    _embeddingModel;
    __uuid;
    __streamUuid;
    __sequence;
    __data;
    __active;
    __createdAt;
    __updatedAt;
    __type;
    __embedding;
    __embeddingModel;


    constructor(connectionUid = null)
    {
        super(connectionUid);

        this._databaseName = 'agent_smith';
        this._schema = 'public';
        this._tableName = 'event';

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
           stream_uuid:
                {
                    columnName: "stream_uuid",
                    attributeName: "_streamUuid",
                    isPrimaryKey: false,
                    dataType: "uuid",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: "public.stream.uuid"
                },
           sequence:
                {
                    columnName: "sequence",
                    attributeName: "_sequence",
                    isPrimaryKey: false,
                    dataType: "bigint",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: null
                },
           data:
                {
                    columnName: "data",
                    attributeName: "_data",
                    isPrimaryKey: false,
                    dataType: "jsonb",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: null
                },
           active:
                {
                    columnName: "active",
                    attributeName: "_active",
                    isPrimaryKey: false,
                    dataType: "boolean",
                    isNullable: false,
                    defaultValue: "true",
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
                },
           type:
                {
                    columnName: "type",
                    attributeName: "_type",
                    isPrimaryKey: false,
                    dataType: "text",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: null
                },
           embedding:
                {
                    columnName: "embedding",
                    attributeName: "_embedding",
                    isPrimaryKey: false,
                    dataType: "USER-DEFINED",
                    isNullable: true,
                    defaultValue: null,
                    foreignKey: null
                },
           embedding_model:
                {
                    columnName: "embedding_model",
                    attributeName: "_embeddingModel",
                    isPrimaryKey: false,
                    dataType: "text",
                    isNullable: true,
                    defaultValue: null,
                    foreignKey: null
                }
        };


        this._primaryKeys = ['uuid'];


        this._uuid = null;
        this.__uuid = null;

        this._streamUuid = null;
        this.__streamUuid = null;

        this._sequence = null;
        this.__sequence = null;

        this._data = null;
        this.__data = null;

        this._active = null;
        this.__active = null;

        this._createdAt = null;
        this.__createdAt = null;

        this._updatedAt = null;
        this.__updatedAt = null;

        this._type = null;
        this.__type = null;

        this._embedding = null;
        this.__embedding = null;

        this._embeddingModel = null;
        this.__embeddingModel = null;

    }

    get uuid()
    {
        return this._uuid;
    }

    set uuid(uuid)
    {
        this._uuid = uuid;
    }

    get streamUuid()
    {
        return this._streamUuid;
    }

    set streamUuid(streamUuid)
    {
        this._streamUuid = streamUuid;
    }

    get sequence()
    {
        return this._sequence;
    }

    set sequence(sequence)
    {
        this._sequence = sequence;
    }

    get data()
    {
        return this._data;
    }

    set data(data)
    {
        this._data = data;
    }

    get active()
    {
        return this._active;
    }

    set active(active)
    {
        this._active = active;
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

    get type()
    {
        return this._type;
    }

    set type(type)
    {
        this._type = type;
    }

    get embedding()
    {
        return this._embedding;
    }

    set embedding(embedding)
    {
        this._embedding = embedding;
    }

    get embeddingModel()
    {
        return this._embeddingModel;
    }

    set embeddingModel(embeddingModel)
    {
        this._embeddingModel = embeddingModel;
    }

    async getAgentStream()
    {
        const stream = new AgentStream(this._connectionUid);
        const found = await stream.search('"uuid" = $1', [this.streamUuid]);
        if(!found)
        {
            return null;
        }
        await stream.next();
        return stream;
    }

    async getAgentFiles()
    {
        const files = new AgentFile(this._connectionUid);
        const found = await files.search('"event_uuid" = $1', [this.uuid]);
        if(!found)
        {
            return null;
        }        
        return files;
    }

}