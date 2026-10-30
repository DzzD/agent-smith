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
import { AgentMemory } from '../../../app/db/models/AgentMemory.js';

export class CoreAgentMemoryFile extends DbObject
{
    _uuid;
    _memoryUuid;
    _name;
    _mimeType;
    _data;
    _description;
    _createdAt;
    _updatedAt;
    __uuid;
    __memoryUuid;
    __name;
    __mimeType;
    __data;
    __description;
    __createdAt;
    __updatedAt;


    constructor(connectionUid = null)
    {
        super(connectionUid);

        this._databaseName = 'agent_smith';
        this._schema = 'public';
        this._tableName = 'memory_file';

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
           memory_uuid:
                {
                    columnName: "memory_uuid",
                    attributeName: "_memoryUuid",
                    isPrimaryKey: false,
                    dataType: "uuid",
                    isNullable: false,
                    defaultValue: null,
                    foreignKey: "public.memory.uuid"
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
                    isNullable: false,
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

        this._memoryUuid = null;
        this.__memoryUuid = null;

        this._name = null;
        this.__name = null;

        this._mimeType = null;
        this.__mimeType = null;

        this._data = null;
        this.__data = null;

        this._description = null;
        this.__description = null;

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

    get memoryUuid()
    {
        return this._memoryUuid;
    }

    set memoryUuid(memoryUuid)
    {
        this._memoryUuid = memoryUuid;
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

    async getAgentMemory()
    {
        const memory = new AgentMemory(this._connectionUid);
        const found = await memory.search('"uuid" = $1', [this.memoryUuid]);
        if(!found)
        {
            return null;
        }
        await memory.next();
        return memory;
    }

}