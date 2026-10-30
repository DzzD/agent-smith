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
import { AgentAgent } from '../../../app/db/models/AgentAgent.js';
import { AgentStream } from '../../../app/db/models/AgentStream.js';
import { AgentMemoryFile } from '../../../app/db/models/AgentMemoryFile.js';

export class CoreAgentMemory extends DbObject
{
    _uuid;
    _agentUuid;
    _streamUuid;
    _key;
    _value;
    _keyEmbedding;
    _valueEmbedding;
    _embeddingModel;
    _createdAt;
    _updatedAt;
    __uuid;
    __agentUuid;
    __streamUuid;
    __key;
    __value;
    __keyEmbedding;
    __valueEmbedding;
    __embeddingModel;
    __createdAt;
    __updatedAt;


    constructor(connectionUid = null)
    {
        super(connectionUid);

        this._databaseName = 'agent_smith';
        this._schema = 'public';
        this._tableName = 'memory';

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
           agent_uuid:
                {
                    columnName: "agent_uuid",
                    attributeName: "_agentUuid",
                    isPrimaryKey: false,
                    dataType: "uuid",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: "public.agent.uuid"
                },
           stream_uuid:
                {
                    columnName: "stream_uuid",
                    attributeName: "_streamUuid",
                    isPrimaryKey: false,
                    dataType: "uuid",
                    isNullable: true,
                    defaultValue: null,
                    foreignKey: "public.stream.uuid"
                },
           key:
                {
                    columnName: "key",
                    attributeName: "_key",
                    isPrimaryKey: false,
                    dataType: "text",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: null
                },
           value:
                {
                    columnName: "value",
                    attributeName: "_value",
                    isPrimaryKey: false,
                    dataType: "text",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: null
                },
           key_embedding:
                {
                    columnName: "key_embedding",
                    attributeName: "_keyEmbedding",
                    isPrimaryKey: false,
                    dataType: "USER-DEFINED",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: null
                },
           value_embedding:
                {
                    columnName: "value_embedding",
                    attributeName: "_valueEmbedding",
                    isPrimaryKey: false,
                    dataType: "USER-DEFINED",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: null
                },
           embedding_model:
                {
                    columnName: "embedding_model",
                    attributeName: "_embeddingModel",
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

        this._agentUuid = null;
        this.__agentUuid = null;

        this._streamUuid = null;
        this.__streamUuid = null;

        this._key = null;
        this.__key = null;

        this._value = null;
        this.__value = null;

        this._keyEmbedding = null;
        this.__keyEmbedding = null;

        this._valueEmbedding = null;
        this.__valueEmbedding = null;

        this._embeddingModel = null;
        this.__embeddingModel = null;

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

    get agentUuid()
    {
        return this._agentUuid;
    }

    set agentUuid(agentUuid)
    {
        this._agentUuid = agentUuid;
    }

    get streamUuid()
    {
        return this._streamUuid;
    }

    set streamUuid(streamUuid)
    {
        this._streamUuid = streamUuid;
    }

    get key()
    {
        return this._key;
    }

    set key(key)
    {
        this._key = key;
    }

    get value()
    {
        return this._value;
    }

    set value(value)
    {
        this._value = value;
    }

    get keyEmbedding()
    {
        return this._keyEmbedding;
    }

    set keyEmbedding(keyEmbedding)
    {
        this._keyEmbedding = keyEmbedding;
    }

    get valueEmbedding()
    {
        return this._valueEmbedding;
    }

    set valueEmbedding(valueEmbedding)
    {
        this._valueEmbedding = valueEmbedding;
    }

    get embeddingModel()
    {
        return this._embeddingModel;
    }

    set embeddingModel(embeddingModel)
    {
        this._embeddingModel = embeddingModel;
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

    async getAgentAgent()
    {
        const agent = new AgentAgent(this._connectionUid);
        const found = await agent.search('"uuid" = $1', [this.agentUuid]);
        if(!found)
        {
            return null;
        }
        await agent.next();
        return agent;
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

    async getAgentMemoryFiles()
    {
        const memoryFiles = new AgentMemoryFile(this._connectionUid);
        const found = await memoryFiles.search('"memory_uuid" = $1', [this.uuid]);
        if(!found)
        {
            return null;
        }        
        return memoryFiles;
    }

}