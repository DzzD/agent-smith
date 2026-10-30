/**
 * AppCoreJS Framework
 * CORE LAYER
 * NOT INTENDED TO BE MODIFIED IN APPLICATION PROJECTS
 * Copyright (c) 2026 Bruno Augier
 * Licensed under the MIT License
 */

import util from 'node:util';
import { DbManager } from '../../app/db/DbManager.js';


export class CoreDbObject
{
  _databaseName;
  _schema;
  _tableName;

  _fields;
  _primaryKeys;
  _searchConnector;

  _connectionUid;

  constructor(connectionUid = "default")
  {
    this._connectionUid = connectionUid;

    this._tableName = null;
    this._fields = {};
    this._primaryKeys = [];

  }

  [util.inspect.custom](_depth, options)
  {
      const currentValues = [];
      const originalValues = [];

      if (this._fields)
      {
          for (const fieldMeta of Object.values(this._fields))
          {
              const attr = fieldMeta.attributeName;
              const originalAttr = '_' + attr;

              currentValues.push(util.inspect(this[attr], options));
              originalValues.push(util.inspect(this[originalAttr], options));
          }
      }

      return `${this._databaseName}.${this._schema}.${this._tableName} :\n`
          + `NEW VALUES - (${currentValues.join(', ')})\n`
          + `OLD VALUES - (${originalValues.join(', ')})`;
  }

  getFullTableName()
  {
    if (this._schema)
    {
      return '"' + this._schema + '"."' + this._tableName + '"';
    }

    return '"' + this._tableName + '"';
  }

  /**
   * Lance une recherche sur la table.
   *
   * @param {string|null} where   Ex: 'name LIKE $1'
   * @param {Array} params        Ex: ['toto%']
   * @param {Object} options      Ex: { limit: 10 }
   * @returns {Promise<boolean>}  true si au moins une ligne, false sinon
   */
  async search(where = null, params = [], { limit = null, order = null } = {})
  {
    if(!this._searchConnector)
    {
      this._searchConnector = DbManager.getConnector(this._databaseName, this._connectionUid);
      this._searchConnector.linkTo(this);
    }

    const connector = this._searchConnector;

    let sql = 'SELECT * FROM ' + this.getFullTableName();

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

    await connector.query(sql, params);

    return this;
  }

  /**
   * Passe à l'enregistrement suivant du curseur actuel.
   * this._searchConnector will call this.fromRow(row) before returning
   */
  async next()
  {
    // const row = await this._searchConnector.next();
    // if (!row) return false;

    return await this._searchConnector.next() != null;
  }

  /**
   * Remplit l'objet à partir d'une ligne.
   * @param {Object} row
   * @param {boolean} full
   * @returns {boolean}
   */
  fromRow(row, full = true)
  {
    if (!row)
    {
      return false;
    }

    for (const fieldMeta of Object.values(this._fields))
    {
      const columnName   = fieldMeta.columnName;
      const attributeName = fieldMeta.attributeName; // ex: "_name"

      if (!full && !Object.prototype.hasOwnProperty.call(row, columnName))
      {
        continue;
      }

      const value        = row[columnName];

      // valeur courante modifiable
      this[attributeName] = value;      // this._name

      // snapshot BDD (original)
      if (full)
      {
        this['_' + attributeName] = value; // this.__name
      }
    }

    return true;
  }

  /**
   * Créer une instance et la lie à un connecteur existant.
   * alias de la table to_jsonb dans la requete source
   */
  static from(dbConnector, alias = null)
  {
    const obj = new this(dbConnector._connectionUid);
    obj._searchConnector = dbConnector;
    dbConnector.linkTo(obj, alias);
    return obj;
  }


  close()
  {
    this._searchConnector.close();
  }


  /**
   * Nombre de lignes actuellement en mémoire dans le curseur.
   * (Attention : si le connecteur est en mode itératif,
   * ce n'est pas forcément le nombre total de lignes.)
   */
  recordCount()
  {
    return this._searchConnector.recordCount();
  }

  /**
   * Sauvegarde l'objet (INSERT ou UPDATE).
   *
   * options:
   *  - forceInsert (bool) : true => force un INSERT même si PK présente
   *
   * Retourne toujours true si aucune exception n'est levée.
   */
  async save(forceInsert = false)
  {
    if (!this.beforeSave())
    {
      this.afterSave(false);
      return false;
    }

    //list changed fields
    const changedFields = [];
    for (const fieldMeta of Object.values(this._fields))
    {
      const attributeName = fieldMeta.attributeName;
      const currentValue  = this[attributeName];
      const originalValue = this['_' + attributeName];

      if (currentValue !== originalValue)
      {
        changedFields.push({ columnName: fieldMeta.columnName, attributeName, fieldMeta });
      }
    }

    //no modification && no forcing => return success
    if (!forceInsert && changedFields.length === 0)
    {
      this.afterSave(true);
      return true;
    }

    let isInsert = forceInsert;

    if (!isInsert)
    {
      if (!this._primaryKeys || this._primaryKeys.length === 0) //No primary key
      {
        isInsert = Object.values(this._fields).every((fm) => //check all snapshot field are undefined/null
        {
          const original = this['_' + fm.attributeName];
          return original === null || original === undefined;
        });
      }
      else
      {
        isInsert = this._primaryKeys.some((columnName) => //check at least one PK is null => insert
        {
          const fm = this._fields[columnName] || Object.values(this._fields).find((fieldMeta) => fieldMeta.columnName === columnName);

          if (!fm)
          {
            return false;
          }

          const attr = fm.attributeName || columnName;
          const v = this[attr];
          return v === null || v === undefined;
        });
      }
    }

    //check when hook beforeInsert or beforeUpdate returning false
    if (isInsert)
    {
      if (!this.beforeInsert())
      {
        this.afterInsert(false);
        this.afterSave(false);
        return false;
      }
    }
    else
    {
      if (!this.beforeUpdate())
      {
        this.afterUpdate(false);
        this.afterSave(false);
        return false;
      }
    }

    //get a connector to make insert or update
    const connector = DbManager.getConnector(this._databaseName, this._connectionUid);
    let insertOrUpdateResult = false;
    if (isInsert)
    {
      const { sql, params } = this.#buildInsertQuery(changedFields);
      await connector.query(sql, params);
      const insertedRow = await connector.next();

      if (insertedRow)
      {
        this.fromRow(insertedRow);        
        this.afterInsert(true);
        insertOrUpdateResult = true;
      }
      else
      {
        this.afterInsert(false);
      }
    }
    else
    {
      const { sql, params } = this.#buildUpdateQuery(changedFields);
      await connector.query(sql, params);

      let updatedRow =  await connector.next();

      if (updatedRow)
      {
        for (const field of changedFields)
        {
          const attributeName = field.attributeName;
          const snapshotName = '_' + attributeName;
          const value = updatedRow[field.columnName];
          this[attributeName] = value;
          this[snapshotName] = value;
        }

        this.afterUpdate(true);
        insertOrUpdateResult = true;
      }
      else
      {
        this.afterUpdate(false);
      }
    }

    this.afterSave(insertOrUpdateResult);

    // connector.close(); **

    return true;
  }


  async delete()
  {
    if (!this.beforeDelete())
    {
      this.afterDelete(false);
      return true;
    }

    const connector = DbManager.getConnector(this._databaseName, this._connectionUid);

    const { whereClauses, params } = this.#buildWhereClauses();

    let sql;

    if (!this._primaryKeys || this._primaryKeys.length === 0)
    {
      const whereClause = whereClauses.join(' AND ');

      sql =
        'DELETE FROM ' + this.getFullTableName() +
        ' WHERE ctid IN (' +
        'SELECT ctid FROM ' + this.getFullTableName() +
        ' WHERE ' + whereClause +
        ' LIMIT 1)';
    }
    else
    {
      sql =
        'DELETE FROM ' + this.getFullTableName() +
        ' WHERE ' + whereClauses.join(' AND ');
    }

    await connector.query(sql, params);

    this.afterDelete(true);

    return true;
  }

  #buildWhereClauses()
  {
    const whereClauses = [];
    const params = [];
    const primaryKeys = this._primaryKeys ?? [];

    if (primaryKeys.length > 0)
    {
      primaryKeys.forEach((columnName, pkIndex) =>
      {
        const fieldMeta = this._fields[columnName];
        const attributeName = fieldMeta.attributeName;
        const placeholderIndex = pkIndex + 1;
        const value = this[attributeName];

        if (value === null || value === undefined)
        {
          whereClauses.push('"' + columnName + '" IS NULL');
        }
        else
        {
          whereClauses.push('"' + columnName + '" = $' + placeholderIndex);
          params.push(value);
        }
      });
    }
    else
    {
      Object.entries(this._fields).forEach(([fieldKey, fieldMeta], fieldIndex) =>
      {
        const attributeName = fieldMeta.attributeName;
        const columnName = fieldMeta.columnName;
        const placeholderIndex = fieldIndex + 1;
        const originalValue = this['_' + attributeName];

        if (originalValue === null || originalValue === undefined)
        {
          whereClauses.push('"' + columnName + '" IS NULL');
          return;
        }

        whereClauses.push('"' + columnName + '" = $' + placeholderIndex);
        params.push(originalValue);
      });
    }

    return { whereClauses, params };
  }

  #buildInsertQuery(changedFields)
  {
    const columns = [];
    const params = [];
    const placeholders = [];

    changedFields.forEach((field, index) =>
    {
      columns.push('"' + field.columnName + '"');
      params.push(this[field.attributeName]);
      placeholders.push('$' + (index + 1));
    });

    const returningColumns = Object.values(this._fields).map((fieldMeta) =>
    {
      return '"' + fieldMeta.columnName + '"';
    });

    const sql =
        'INSERT INTO ' + this.getFullTableName() +
      ' (' + columns.join(', ') + ')' +
      ' VALUES (' + placeholders.join(', ') + ')' +
      ' RETURNING ' + returningColumns.join(', ');

    return { sql, params };
  }

  #buildUpdateQuery(changedFields)
  {
    const { whereClauses, params: whereParams } = this.#buildWhereClauses();

    const setClauses = [], setParams = [];

    changedFields.forEach((field, index) =>
    {
      const placeholderIndex = whereParams.length + index + 1;
      setClauses.push('"' + field.columnName + '"' + ' = $' + placeholderIndex);
      setParams.push(this[field.attributeName]);
    });

    const params = whereParams.concat(setParams);
    const returningClause = changedFields.length > 0
      ? ' RETURNING ' + changedFields.map((field) => '"' + field.columnName + '"').join(', ')
      : '';

    if (!this._primaryKeys || this._primaryKeys.length === 0)
    {
      const whereClause = whereClauses.join(' AND ');
      const sql =
        'UPDATE ' + this.getFullTableName() +
        ' SET ' + setClauses.join(', ') +
        ' WHERE ctid IN (' +
        'SELECT ctid FROM ' + this.getFullTableName() +
        ' WHERE ' + whereClause +
        ' LIMIT 1)' +
        returningClause;

      return { sql, params };
    }

    const sql =
        'UPDATE ' + this.getFullTableName() +
      ' SET ' + setClauses.join(', ') +
      ' WHERE ' + whereClauses.join(' AND ') +
      returningClause;

    return { sql, params };
  }

  getType(field)
  {
      const type = this.constructor.fields?.[field]?.type;

      if (!type)
      {
          return null;
      }

      if (
          type.includes('int') ||
          type === 'numeric' ||
          type === 'decimal' ||
          type === 'real' ||
          type === 'double precision'
      )
      {
          return 'number';
      }

      if (type === 'boolean')
      {
          return 'boolean';
      }

      if (type === 'date')
      {
          return 'date';
      }

      if (type.includes('timestamp'))
      {
          return 'datetime';
      }

      if (type === 'vector')
      {
          return 'vector';
      }

      return 'string';
  }  

  // ===========================
// Hooks (override dans DbObject ou ApplicationXXX)
// ===========================

  beforeSave()
  {
    return true;
  }

  afterSave(success)
  {
  }

  beforeInsert()
  {
    return true;
  }

  afterInsert(success)
  {
  }

  beforeUpdate()
  {
    return true;
  }

  afterUpdate(success)
  {
  }

  beforeDelete()
  {
    return true;
  }

  afterDelete(success)
  {
  }
}
