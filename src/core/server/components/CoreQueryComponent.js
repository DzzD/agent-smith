/**
 * AppCoreJS Framework
 * CORE LAYER
 * NOT INTENDED TO BE MODIFIED IN APPLICATION PROJECTS
 * Copyright (c) 2026 Bruno Augier
 * Licensed under the MIT License
 */

import { ServerComponent } from '../../../app/server/ServerComponent.js';

export class CoreQueryComponent extends ServerComponent
{
    static TYPES =
    {
        STRING: "string",
        NUMBER: "number",
        BOOLEAN: "boolean",
        DATE: "date",
        DATETIME: "datetime",
        VECTOR: "vector",
        ENUM: "enum",
        SELECT: "select"
    };

    static OPERATORS =
    {
        EQUALS: "=",
        CONTAINS: "contains",
        STARTS_WITH: "starts_with",
        GREATER: ">",
        LOWER: "<",
        GREATER_EQUALS: ">=",
        LOWER_EQUALS: "<="
    };

    title = null;
    serverUri = null;
    query = null;

    key =
    [
        "id"
    ];

    groups = [];
    fields = [];
    criterias = [];
    actions = [];

    editableDbObjects = [];

    order =
    {
        field: null,
        direction: "asc"
    };

    resultSizeMin = 30;
    resultSizeIncrement = 30;


    start()
    {
        this.startHttp();
    }


    startHttp(route = this.serverUri)
    {
        this.server.application.get(route, async (request, response) =>
        {
            response.json(this.getDefinition());
        });

        this.server.application.post(route, async (request, response) =>
        {
            const result = await this.action(
                request.body?.action,
                request.body?.args ?? null
            );

            response.json(result);
        });
    }


    getDefinition()
    {
        return {
            title: this.title,
            key: this.key,
            groups: this.getGroups(),
            fields: this.getFields(),
            criterias: this.getCriterias(),
            actions: this.getActions(),
            order: this.order,
            resultSizeMin: this.resultSizeMin,
            resultSizeIncrement: this.resultSizeIncrement
        };
    }


    getGroups()
    {
        return this.groups.map((group) =>
        {
            return {
                code: group.code,
                label: group.label
            };
        });
    }


    getFields()
    {
        return this.fields.map((field) =>
        {
            return {
                code: field.code,
                label: field.label,
                type: field.type ?? null,
                group: field.group ?? null,
                operator: field.operator ?? this.constructor.OPERATORS.EQUALS,
                readonly: field.readonly ?? false,
                required: field.required ?? false,
                visible: field.visible ?? true,
                sortable: field.sortable ?? true,
                width: field.width ?? null,
                options: field.options ?? []
            };
        });
    }


    getCriterias()
    {
        return this.criterias.map((criteria) =>
        {
            return {
                code: criteria.code,
                label: criteria.label,
                type: criteria.type ?? null,
                operator: criteria.operator ?? this.constructor.OPERATORS.EQUALS,
                options: criteria.options ?? []
            };
        });
    }


    getActions()
    {
        return this.actions;
    }


    async action(name, args = null)
    {
        switch (name)
        {
            case "search":
            {
                return this.search(args?.criterias ?? {}, args?.options ?? {});
            }

            case "save":
            {
                return this.save(args?.records ?? []);
            }

            case "delete":
            {
                return this.remove(args?.records ?? []);
            }

            default:
            {
                return {
                    action: name,
                    error: "Unknown action"
                };
            }
        }
    }


    async search(criterias = {}, options = {})
    {
        const where = this.getSqlWhere(criterias);
        const order = this.getSqlOrder(options.order ?? this.order);
        const resultSize = this.getSearchLimit(options);

        let searchRecordCount = null;

        if (typeof this.query?.recordCountAll === "function")
        {
            searchRecordCount = await this.query.recordCountAll(
                where.sql,
                where.params
            );
        }

        await this.query.search(where.sql, where.params,
        {
            order,
            limit: resultSize
        });

        const records = [];

        while (await this.query.next())
        {
            records.push(this.result());
        }

        const result =
        {
            action: "search",
            criterias: this.getCriterias(),
            fields: this.getFields(),
            actions: this.getActions(),
            order: options.order ?? this.order,
            resultSize,
            resultSizeMin: this.resultSizeMin,
            resultSizeIncrement: this.resultSizeIncrement,
            records
        };

        if (searchRecordCount !== null)
        {
            result.searchRecordCount = searchRecordCount;
        }

        return result;
    }


    getSearchLimit(options = {})
    {
        const limit = Number(options?.limit);

        if (Number.isFinite(limit))
        {
            return Math.max(1, limit);
        }

        return this.getResultSize(options?.resultSize);
    }


    getResultSize(resultSize = null)
    {
        const size = Number(resultSize ?? this.resultSizeMin);

        if (!Number.isFinite(size))
        {
            return this.resultSizeMin;
        }

        return Math.max(this.resultSizeMin, size);
    }


    getSqlWhere(criterias = {})
    {
        const sql = [];
        const params = [];
        const handledCodes = new Set();

        for (const criteria of this.criterias)
        {
            handledCodes.add(criteria.code);

            const where = this.getSqlWhereForCriteria(
                criteria,
                criterias[criteria.code],
                criterias,
                params.length + 1
            );

            if (!where)
            {
                continue;
            }

            if (where.sql)
            {
                sql.push(where.sql);
            }

            if (Array.isArray(where.params))
            {
                params.push(...where.params);
            }
        }

        for (const [code, value] of Object.entries(criterias))
        {
            if (handledCodes.has(code))
            {
                continue;
            }

            const keyFields = this.key;

            const field = this.fields.find((item) => item.code === code)
                ?? (keyFields.includes(code)
                    ?
                    {
                        code,
                        field: code
                    }
                    : null);

            if (!field)
            {
                continue;
            }

            const where = this.getSqlWhereForCriteria(
                {
                    ...field,
                    code,
                    operator: field.operator ?? this.constructor.OPERATORS.EQUALS
                },
                value,
                criterias,
                params.length + 1
            );

            if (!where)
            {
                continue;
            }

            if (where.sql)
            {
                sql.push(where.sql);
            }

            if (Array.isArray(where.params))
            {
                params.push(...where.params);
            }
        }

        return {
            sql: sql.join(" AND "),
            params
        };
    }


    getSqlWhereForCriteria(criteria, value, criterias, paramIndex)
    {
        if (value === undefined || value === null || value === "")
        {
            return null;
        }

        const field = this.getSqlField(criteria);
        const operator = criteria.operator ?? this.constructor.OPERATORS.EQUALS;

        if (operator === this.constructor.OPERATORS.CONTAINS)
        {
            return {
                sql: `${field}::text ILIKE $${paramIndex}`,
                params: [`%${value}%`]
            };
        }

        if (operator === this.constructor.OPERATORS.STARTS_WITH)
        {
            return {
                sql: `${field}::text ILIKE $${paramIndex}`,
                params: [`${value}%`]
            };
        }

        if (operator === this.constructor.OPERATORS.GREATER)
        {
            return {
                sql: `${field} > $${paramIndex}`,
                params: [value]
            };
        }

        if (operator === this.constructor.OPERATORS.LOWER)
        {
            return {
                sql: `${field} < $${paramIndex}`,
                params: [value]
            };
        }

        if (operator === this.constructor.OPERATORS.GREATER_EQUALS)
        {
            return {
                sql: `${field} >= $${paramIndex}`,
                params: [value]
            };
        }

        if (operator === this.constructor.OPERATORS.LOWER_EQUALS)
        {
            return {
                sql: `${field} <= $${paramIndex}`,
                params: [value]
            };
        }

        return {
            sql: `${field} = $${paramIndex}`,
            params: [value]
        };
    }


    getSqlField(item)
    {
        if (item.sql)
        {
            return item.sql;
        }

        if (item.alias && item.field)
        {
            return `${this.quoteSqlIdentifier(item.alias)}.${this.quoteSqlIdentifier(item.field)}`;
        }

        return this.quoteSqlIdentifier(item.field ?? item.code);
    }


    quoteSqlIdentifier(name)
    {
        return `"${String(name).replaceAll('"', '""')}"`;
    }


    getSqlOrder(order = null)
    {
        const fieldCode = order?.field ?? order?.column;

        if (!fieldCode)
        {
            return null;
        }

        const field = this.fields.find((item) => item.code === fieldCode);

        if (!field)
        {
            return null;
        }

        const direction = order.direction === "desc" ? "DESC" : "ASC";

        return `${this.getSqlField(field)} ${direction}`;
    }


    result()
    {
        const result = {};

        for (const field of this.fields)
        {
            result[field.code] = this.resultField(field);
        }

        return result;
    }


    resultField(field)
    {
        return this.query.getFieldValue(field.code, field.object);
    }


    getRecordCriterias(record = {})
    {
        const current = record.current ?? null;
        const values = record.new ?? null;

        const keyCriterias = {};

        for (const keyField of this.key)
        {
            const value = current?.[keyField] ?? values?.[keyField];

            if (value === undefined || value === null || value === "")
            {
                break;
            }

            keyCriterias[keyField] = value;
        }

        if (Object.keys(keyCriterias).length === this.key.length)
        {
            return keyCriterias;
        }

        if (!current)
        {
            return {};
        }

        const currentCriterias = {};

        for (const [code, value] of Object.entries(current))
        {
            if (value === undefined || value === null || value === "")
            {
                continue;
            }

            currentCriterias[code] = value;
        }

        return currentCriterias;
    }


    applyRecord(record = {})
    {
        const values = record.new ?? {};
        const rows = {};

        for (const objectName of this.editableDbObjects)
        {
            rows[objectName] = {};
        }

        for (const field of this.fields)
        {
            if (field.readonly === true || !(field.code in values))
            {
                continue;
            }

            const targetField = field.field ?? field.code;

            if (field.object)
            {
                if (!(field.object in rows))
                {
                    rows[field.object] = {};
                }

                rows[field.object][targetField] = values[field.code];
                continue;
            }

            for (const objectName of this.editableDbObjects)
            {
                rows[objectName][targetField] = values[field.code];
            }
        }

        for (const objectName of Object.keys(rows))
        {
            this.query.getDbObject(objectName).fromRow(rows[objectName], false);
        }
    }


    async save(records = [])
    {
        const savedRecords = [];

        for (const record of records)
        {
            const criterias = this.getRecordCriterias(record);
            let found = false;

            if (Object.keys(criterias).length > 0)
            {
                const where = this.getSqlWhere(criterias);

                await this.query.search(where.sql, where.params,
                {
                    limit: 1
                });

                found = await this.query.next();
            }

            if (!found)
            {
                for (const objectName of this.editableDbObjects)
                {
                    this.query.getDbObject(objectName).fromRow(record.current ?? {}, true);
                }
            }

            this.applyRecord(record);

            for (const objectName of this.editableDbObjects)
            {
                await this.query.getDbObject(objectName).save();
            }

            const refreshCriterias = this.getRecordCriterias(
            {
                current:
                {
                    ...(record.current ?? {}),
                    ...(record.new ?? {})
                }
            });

            const refreshWhere = this.getSqlWhere(refreshCriterias);

            if (refreshWhere.sql)
            {
                await this.query.search(refreshWhere.sql, refreshWhere.params,
                {
                    limit: 1
                });

                if (await this.query.next())
                {
                    savedRecords.push(this.result());
                    continue;
                }
            }

            savedRecords.push(this.result());
        }

        return {
            action: "save",
            records: savedRecords
        };
    }


    async remove(records = [])
    {
        const removedRecords = [];
        const errors = [];

        for (const record of records)
        {
            const criterias = this.getRecordCriterias(
            {
                current: record.current
            });

            if (Object.keys(criterias).length === 0)
            {
                errors.push(
                {
                    error: "Delete requires key or current values",
                    current: record.current ?? null
                });
                continue;
            }

            const where = this.getSqlWhere(criterias);

            await this.query.search(where.sql, where.params,
            {
                limit: 1
            });

            if (!(await this.query.next()))
            {
                errors.push(
                {
                    error: "Record not found",
                    current: record.current ?? null
                });
                continue;
            }

            const removedRecord = this.result();

            for (const objectName of this.editableDbObjects)
            {
                await this.query.getDbObject(objectName).delete();
            }

            removedRecords.push(removedRecord);
        }

        const result =
        {
            action: "delete",
            records: removedRecords
        };

        if (errors.length > 0)
        {
            result.error = "Delete failed for one or more records";
            result.errors = errors;
        }

        return result;
    }
}
