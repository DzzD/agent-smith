/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { AgentUtils } from './AgentUtils.js';

export class AgentSkill
{
  constructor({ toolValueMaxChar = 20000 } = {})
  {
    this.agent = null;
    this.tools = [];
    this.toolValueMaxChar = toolValueMaxChar;
  }

  get name()
  {
    return this.constructor.name;
  }

  async load(context = {})
  {
    return null;
  }

  isLoaded(loadedSkillNames = new Set(), streamId = undefined)
  {
    if (!this.isInitialized(streamId))
    {
      return false;
    }

    if (this.loadOnDemand !== true)
    {
      return true;
    }

    return loadedSkillNames instanceof Set
      ? loadedSkillNames.has(this.name)
      : new Set(loadedSkillNames ?? []).has(this.name);
  }

  isInitialized(streamId = undefined)
  {
    return true;
  }

  getTools(streamId = undefined)
  {
    return this.tools;
  }

  get keepToolCallsOnCompression()
  {
    return false;
  }

  processToolData(toolName)
  {
    return true;
  }

  getHumanReadableToolAction(toolName, args = {})
  {
    const humanReadableAction = args?.humanReadableAction ?? toolName.replaceAll('_', ' ');
    const humanReadableArg = args?.humanReadableArg ?? '';

    if (!humanReadableArg)
    {
      return humanReadableAction;
    }

    return `${humanReadableAction} (${humanReadableArg})`;
  }

  async execute(toolName, args = {}, context = {})
  {
    const tool = this.tools.find((tool) => tool.name === toolName);

    if (!tool)
    {
      throw new Error(`Unsupported tool: ${toolName}`);
    }

    this.#validateToolArgs(tool, args);

    if (typeof toolName !== 'string')
    {
      throw new Error(`Unsupported tool: ${toolName}`);
    }

    const handler = this[toolName];

    return await handler.call(this, args, context);
  }

  async _parseToolValue(value, callId, pathSegments = [], streamId = undefined, dataScope = 'results', context = {})
  {
    if (Array.isArray(value))
    {
      const serializedValue = JSON.stringify(value, null, 2).replace(/^[ \t]+/gm, '');

      if (serializedValue.length > this.toolValueMaxChar)
      {
        return await this._storeToolValue(serializedValue, callId, pathSegments, streamId, dataScope, context);
      }

      const output = [];

      for (let index = 0; index < value.length; index++)
      {
        output.push(await this._parseToolValue(value[index], callId, [...pathSegments, String(index)], streamId, dataScope, context));
      }

      return output;
    }

    if (typeof value === 'string')
    {
      if (value.length <= this.toolValueMaxChar)
      {
        return value;
      }

      return await this._storeToolValue(value, callId, pathSegments, streamId, dataScope, context);
    }

    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value))
    {
      return await this._storeToolBuffer(value, callId, pathSegments, streamId, 'Buffer', dataScope, context);
    }

    if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer)
    {
      return await this._storeToolBuffer(
        Buffer.from(value),
        callId,
        pathSegments,
        streamId,
        'ArrayBuffer',
        dataScope,
        context
      );
    }

    if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(value))
    {
      const buffer = Buffer.from(
        value.buffer,
        value.byteOffset,
        value.byteLength
      );

      return await this._storeToolBuffer(
        buffer,
        callId,
        pathSegments,
        streamId,
        value.constructor?.name || 'TypedArray',
        dataScope,
        context
      );
    }

    if (value && typeof value === 'object')
    {
      const serializedValue = JSON.stringify(value, null, 2).replace(/^[ \t]+/gm, '');

      if (serializedValue.length > this.toolValueMaxChar)
      {
        return await this._storeToolValue(serializedValue, callId, pathSegments, streamId, dataScope, context);
      }

      const output = {};

      for (const [key, childValue] of Object.entries(value))
      {
        output[key] = await this._parseToolValue(childValue, callId, [...pathSegments, key], streamId, dataScope, context);
      }

      return output;
    }

    return value;
  }

  async _storeToolBuffer(buffer, callId, pathSegments, streamId = undefined, type = 'BinaryData', dataScope = 'results', context = {})
  {
    const tempFileManagerSkill = this.agent?.skills?.get('TempFileManagerSkill');

    if (!tempFileManagerSkill)
    {
      throw new Error('Cannot externalize binary tool data: TempFileManagerSkill is required.');
    }

    const rootPath = `internal/tool/${dataScope}/${callId}`;

    const tempFileName = pathSegments.length > 0
      ? `${rootPath}/${pathSegments.join('/')}.bin`
      : `${rootPath}/response.bin`;

    await tempFileManagerSkill.temp_file_remove({ tempFileName }, { ...context, streamId, eventUuid: context.eventUuid }).catch(() => {});
    await tempFileManagerSkill.temp_file_create({
      tempFileName,
      mimeType: 'application/octet-stream',
      description: `Externalized binary tool ${dataScope} value for call ${callId}`,
      owner: 'internal',
    }, { ...context, streamId, eventUuid: context.eventUuid });
    await tempFileManagerSkill.appendBuffer({
      tempFileName,
      data: buffer,
    }, { ...context, streamId, eventUuid: context.eventUuid });

    return {
      success: true,
      message: `Tool ${dataScope} data are available in ${tempFileName}.`,
      storedInTempFile: true,
      binaryData: true,
      type,
      tempFileName,
      byteLength: buffer.length,
    };
  }

  async _storeToolValue(value, callId, pathSegments, streamId = undefined, dataScope = 'results', context = {})
  {
    const tempFileManagerSkill = this.agent?.skills?.get('TempFileManagerSkill');

    if (!tempFileManagerSkill)
    {
      throw new Error('Cannot externalize tool data: TempFileManagerSkill is required.');
    }

    const rootPath = `internal/tool/${dataScope}/${callId}`;

    const tempFileName = `${rootPath}/${pathSegments.length > 0 ? pathSegments.join('/') : 'response'}.json`;

    await tempFileManagerSkill.temp_file_remove({ tempFileName }, { ...context, streamId, eventUuid: context.eventUuid }).catch(() => {});
    await tempFileManagerSkill.temp_file_create({
      tempFileName,
      mimeType: 'application/json',
      description: `Externalized oversized tool ${dataScope} value for call ${callId}`,
      owner: 'internal',
    }, { ...context, streamId, eventUuid: context.eventUuid });
    await tempFileManagerSkill.appendBuffer({
      tempFileName,
      data: Buffer.from(value, 'utf8'),
    }, { ...context, streamId, eventUuid: context.eventUuid });

    return {
      success: true,
      message: `Tool ${dataScope} data are available in ${tempFileName}.`,
      storedInTempFile: true,
      tempFileName,
      charCount: value.length,
    };
  }

  get usage()
  {
    return "";
  }

  get developerPrompt()
  {
    if(!this.usage)
    {
      console.log (this.constructor.name);
    }
    const toolList = this.tools.map((tool) => `- ${tool.name}`).join('\n');

    return [
      `Skill: ${this.name}`,
      `Description:`,
      this.description,
      '',
      `Functions:`,
      toolList,
      '',
      `Usage:`,
      this.usage.trim(),
    ].join('\n');
  }

  buildSkillNode({ loadOnDemand = false, includeFullContent = false, streamId = undefined } = {})
  {
    const nameAttribute = AgentUtils.escapeXmlAttribute(this.name || 'skill');
    const modeAttribute = loadOnDemand
      ? 'loadOnDemand'
      : 'permanent';
    const descriptionText = this.description ?? '';

    const sections = [this.#wrapBlock('description', descriptionText)];

    const showFullContent = !loadOnDemand || includeFullContent;

    if (showFullContent)
    {
      const rulesText = this.usage ?? '';

      sections.push(
        '',
        this.#buildFunctionsBlock(streamId),
        '',
        this.#wrapBlock('rules', rulesText),
      );
    }
    else
    {
      const loadText = `Call load_skill with skillName="${this.name}" before using this skill.`;

      sections.push(
        '',
        this.#wrapBlock('load', loadText),
      );
    }

    return [
      `  <skill name="${nameAttribute}" mode="${modeAttribute}">`,
      ...sections,
      '  </skill>',
    ].join('\n');
  }

  #wrapBlock(tagName, content)
  {
    const text = AgentUtils.formatMultilineText(content || '');
    const lines = text ? text.split('\n') : [];

    if (!lines.length)
    {
      return [
        `    <${tagName}>`,
        '    </' + tagName + '>',
      ].join('\n');
    }

    return [
      `    <${tagName}>`,
      ...lines.map((line) => `      ${line}`),
      `    </${tagName}>`,
    ].join('\n');
  }

  #buildFunctionsBlock(streamId = undefined)
  {
    const tools = this.getTools(streamId);

    if (!Array.isArray(tools))
    {
      return [
        '    <functions>',
        '    </functions>',
      ].join('\n');
    }

    const lines = tools
      .map((tool) => typeof tool?.name === 'string' ? tool.name.trim() : '')
      .filter(Boolean)
      .map((name) => `      <function>${AgentUtils.escapeXmlText(name)}</function>`);

    return [
      '    <functions>',
      ...lines,
      '    </functions>',
    ].join('\n');
  }


  #validateToolArgs(tool, args)
  {
    const parameters = tool.parameters ?? {};
    const properties = parameters.properties ?? {};
    const required = Array.isArray(parameters.required) ? parameters.required : [];
    const additionalProperties = parameters.additionalProperties;
    const allowedKeys = Object.keys(properties);
    const receivedKeys = args && typeof args === 'object' && !Array.isArray(args)
      ? Object.keys(args)
      : [];

    if (!args || typeof args !== 'object' || Array.isArray(args))
    {
      throw new Error(
        `Invalid arguments for tool "${tool.name}". ` +
        `Expected a JSON object. ` +
        `Allowed arguments are exactly: ${allowedKeys.map((key) => `"${key}"`).join(', ')}. ` +
        `Retry exactly with: ${this.#buildExampleObject(tool)}`
      );
    }

    const missingRequired = required.filter((key) => !(key in args));
    const unexpected = additionalProperties === false
      ? receivedKeys.filter((key) => !(key in properties))
      : [];

    if (missingRequired.length || unexpected.length)
    {
      let message = `Invalid call to tool "${tool.name}". `;

      if (missingRequired.length)
      {
        message += `Missing required argument${missingRequired.length > 1 ? 's' : ''}: ${missingRequired.map((key) => `"${key}"`).join(', ')}. `;
      }

      if (unexpected.length)
      {
        message += `Unexpected argument${unexpected.length > 1 ? 's' : ''}: ${unexpected.map((key) => `"${key}"`).join(', ')}. `;
      }

      message += `Allowed arguments for "${tool.name}" are exactly: ${allowedKeys.map((key) => `"${key}"`).join(', ')}. `;

      if ('text' in args && 'message' in properties)
      {
        message += `Do not use "text". Use "message" instead. `;
      }

      if ('token' in args)
      {
        message += `Do not provide "token". `;
      }

      message += `Retry exactly with: ${this.#buildExampleObject(tool)}`;

      throw new Error(message);
    }

    for (const [key, schema] of Object.entries(properties))
    {
      if (!(key in args))
      {
        continue;
      }

      const value = args[key];
      const isRequired = required.includes(key);

      if (this.#isAllowedNull(schema, value))
      {
        continue;
      }

      if (schema?.type === 'string')
      {
        if (typeof value !== 'string')
        {
          throw new Error(
            `Invalid argument "${key}" for tool "${tool.name}". ` +
            `Expected a string. ` +
            `Retry exactly with: ${this.#buildExampleObject(tool)}`
          );
        }

        if (!value.trim())
        {
          if (!isRequired && this.#isAllowedNull(schema, null))
          {
            args[key] = null;
            continue;
          }

          throw new Error(
            `Invalid argument "${key}" for tool "${tool.name}". ` +
            `Expected a non-empty string. ` +
            `Retry exactly with: ${this.#buildExampleObject(tool)}`
          );
        }

        args[key] = value.trim();
        continue;
      }

      if (schema?.type === 'boolean' && typeof value !== 'boolean')
      {
        throw new Error(
          `Invalid argument "${key}" for tool "${tool.name}". ` +
          `Expected a boolean. ` +
          `Retry exactly with: ${this.#buildExampleObject(tool)}`
        );
      }

      if (schema?.type === 'number' && typeof value !== 'number')
      {
        throw new Error(
          `Invalid argument "${key}" for tool "${tool.name}". ` +
          `Expected a number. ` +
          `Retry exactly with: ${this.#buildExampleObject(tool)}`
        );
      }

      if (schema?.type === 'integer' && !Number.isInteger(value))
      {
        throw new Error(
          `Invalid argument "${key}" for tool "${tool.name}". ` +
          `Expected an integer. ` +
          `Retry exactly with: ${this.#buildExampleObject(tool)}`
        );
      }

      if (schema?.type === 'array' && !Array.isArray(value))
      {
        throw new Error(
          `Invalid argument "${key}" for tool "${tool.name}". ` +
          `Expected an array. ` +
          `Retry exactly with: ${this.#buildExampleObject(tool)}`
        );
      }
    }
  }



  #isAllowedNull(schema, value)
  {
    if (value !== null)
    {
      return false;
    }

    if (!schema)
    {
      return false;
    }

    if (schema.type === 'null')
    {
      return true;
    }

    if (Array.isArray(schema.anyOf))
    {
      return schema.anyOf.some((entry) => entry?.type === 'null');
    }

    if (Array.isArray(schema.oneOf))
    {
      return schema.oneOf.some((entry) => entry?.type === 'null');
    }

    if (Array.isArray(schema.type))
    {
      return schema.type.includes('null');
    }

    return false;
  }

  #buildExampleObject(tool)
  {
    const properties = tool.parameters?.properties ?? {};
    const required = Array.isArray(tool.parameters?.required) ? tool.parameters.required : [];
    const example = {};

    for (const key of required)
    {
      const schema = properties[key];

      if (schema?.type === 'boolean')
      {
        example[key] = false;
      }
      else if (schema?.type === 'integer' || schema?.type === 'number')
      {
        example[key] = 0;
      }
      else if (schema?.type === 'array')
      {
        example[key] = [];
      }
      else
      {
        example[key] = '...';
      }
    }

    return JSON.stringify(example);
  }
}
