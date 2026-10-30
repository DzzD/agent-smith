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
import { AgentEvent } from '../../../app/db/models/AgentEvent.js';

export class CoreAgentFile extends DbObject
{
    _uuid;
    _agentUuid;
    _streamUuid;
    _eventUuid;
    _name;
    _mimeType;
    _data;
    _description;
    _owner;
    _permanent;
    _active;
    _createdAt;
    _updatedAt;
    __uuid;
    __agentUuid;
    __streamUuid;
    __eventUuid;
    __name;
    __mimeType;
    __data;
    __description;
    __owner;
    __permanent;
    __active;
    __createdAt;
    __updatedAt;


    constructor(connectionUid = null)
    {
        super(connectionUid);

        this._databaseName = 'agent_smith';
        this._schema = 'public';
        this._tableName = 'file';

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
           event_uuid:
                {
                    columnName: "event_uuid",
                    attributeName: "_eventUuid",
                    isPrimaryKey: false,
                    dataType: "uuid",
                    isNullable: true,
                    defaultValue: null,
                    foreignKey: "public.event.uuid"
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
           mime_type:
                {
                    columnName: "mime_type",
                    attributeName: "_mimeType",
                    isPrimaryKey: false,
                    dataType: "text",
                    isNullable: true,
                    defaultValue: null,
                    foreignKey: null
                },
           data:
                {
                    columnName: "data",
                    attributeName: "_data",
                    isPrimaryKey: false,
                    dataType: "bytea",
                    isNullable: true,
                    defaultValue: null,
                    foreignKey: null
                },
           description:
                {
                    columnName: "description",
                    attributeName: "_description",
                    isPrimaryKey: false,
                    dataType: "text",
                    isNullable: true,
                    defaultValue: null,
                    foreignKey: null
                },
           owner:
                {
                    columnName: "owner",
                    attributeName: "_owner",
                    isPrimaryKey: false,
                    dataType: "text",
                    isNullable: true,
                    defaultValue: null,
                    foreignKey: null
                },
           permanent:
                {
                    columnName: "permanent",
                    attributeName: "_permanent",
                    isPrimaryKey: false,
                    dataType: "boolean",
                    isNullable: false,
                    defaultValue: "false",
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
                }
        };


        this._primaryKeys = ['uuid'];


        this._uuid = null;
        this.__uuid = null;

        this._agentUuid = null;
        this.__agentUuid = null;

        this._streamUuid = null;
        this.__streamUuid = null;

        this._eventUuid = null;
        this.__eventUuid = null;

        this._name = null;
        this.__name = null;

        this._mimeType = null;
        this.__mimeType = null;

        this._data = null;
        this.__data = null;

        this._description = null;
        this.__description = null;

        this._owner = null;
        this.__owner = null;

        this._permanent = null;
        this.__permanent = null;

        this._active = null;
        this.__active = null;

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

    get eventUuid()
    {
        return this._eventUuid;
    }

    set eventUuid(eventUuid)
    {
        this._eventUuid = eventUuid;
    }

    get name()
    {
        return this._name;
    }

    set name(name)
    {
        this._name = name;
    }

    get mimeType()
    {
        return this._mimeType;
    }

    set mimeType(mimeType)
    {
        this._mimeType = mimeType;
    }

    get data()
    {
        return this._data;
    }

    set data(data)
    {
        this._data = data;
    }

    get description()
    {
        return this._description;
    }

    set description(description)
    {
        this._description = description;
    }

    get owner()
    {
        return this._owner;
    }

    set owner(owner)
    {
        this._owner = owner;
    }

    get permanent()
    {
        return this._permanent;
    }

    set permanent(permanent)
    {
        this._permanent = permanent;
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

    async getAgentEvent()
    {
        const event = new AgentEvent(this._connectionUid);
        const found = await event.search('"uuid" = $1', [this.eventUuid]);
        if(!found)
        {
            return null;
        }
        await event.next();
        return event;
    }

}