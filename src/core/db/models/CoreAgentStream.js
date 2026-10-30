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
import { AgentChannel } from '../../../app/db/models/AgentChannel.js';
import { AgentEvent } from '../../../app/db/models/AgentEvent.js';
import { AgentFile } from '../../../app/db/models/AgentFile.js';
import { AgentMemory } from '../../../app/db/models/AgentMemory.js';

export class CoreAgentStream extends DbObject
{
    _uuid;
    _agentUuid;
    _channelUuid;
    _streamId;
    _createdAt;
    _updatedAt;
    __uuid;
    __agentUuid;
    __channelUuid;
    __streamId;
    __createdAt;
    __updatedAt;


    constructor(connectionUid = null)
    {
        super(connectionUid);

        this._databaseName = 'agent_smith';
        this._schema = 'public';
        this._tableName = 'stream';

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
           channel_uuid:
                {
                    columnName: "channel_uuid",
                    attributeName: "_channelUuid",
                    isPrimaryKey: false,
                    dataType: "uuid",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: "public.channel.uuid"
                },
           stream_id:
                {
                    columnName: "stream_id",
                    attributeName: "_streamId",
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

        this._channelUuid = null;
        this.__channelUuid = null;

        this._streamId = null;
        this.__streamId = null;

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

    get channelUuid()
    {
        return this._channelUuid;
    }

    set channelUuid(channelUuid)
    {
        this._channelUuid = channelUuid;
    }

    get streamId()
    {
        return this._streamId;
    }

    set streamId(streamId)
    {
        this._streamId = streamId;
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

    async getAgentChannel()
    {
        const channel = new AgentChannel(this._connectionUid);
        const found = await channel.search('"uuid" = $1', [this.channelUuid]);
        if(!found)
        {
            return null;
        }
        await channel.next();
        return channel;
    }

    async getAgentEvents()
    {
        const events = new AgentEvent(this._connectionUid);
        const found = await events.search('"stream_uuid" = $1', [this.uuid]);
        if(!found)
        {
            return null;
        }        
        return events;
    }

    async getAgentFiles()
    {
        const files = new AgentFile(this._connectionUid);
        const found = await files.search('"stream_uuid" = $1', [this.uuid]);
        if(!found)
        {
            return null;
        }        
        return files;
    }

    async getAgentMemorys()
    {
        const memorys = new AgentMemory(this._connectionUid);
        const found = await memorys.search('"stream_uuid" = $1', [this.uuid]);
        if(!found)
        {
            return null;
        }        
        return memorys;
    }

}