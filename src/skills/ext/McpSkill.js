/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { AgentSkill } from '../../AgentSkill.js';

export class McpSkill extends AgentSkill
{
  constructor({
    name,
    endpoint,
    accessToken = null,
    protocolVersion = '2025-11-25',
    timeout = 30000,
    reconnectDelayMs = 10000,
    description = null,
    toolValueMaxChar = 20000,
  } = {})
  {
    super({ toolValueMaxChar });

    this._name = this._normalizeRequiredString(name, 'name');
    this.endpoint = this._normalizeEndpoint(endpoint);
    this.accessToken = accessToken == null ? null : this._normalizeRequiredString(accessToken, 'accessToken');
    this.protocolVersion = this._normalizeRequiredString(protocolVersion, 'protocolVersion');
    this.timeout = this._normalizeTimeout(timeout);
    this.reconnectDelayMs = this._normalizeTimeout(reconnectDelayMs);
    this.description = description == null
      ? `MCP server available at ${this.endpoint}.`
      : this._normalizeRequiredString(description, 'description');

    this.tools = [];
    this.streamStates = new Map();
  }

  get name()
  {
    return this._name;
  }

  get usage()
  {
    return '- Call the MCP tools directly when needed.';
  }

  getHumanReadableToolAction(toolName, args = {})
  {
    const toolNameReadable = {
      AgentSmith: '⚙️ running Agent Smith action',
    }[toolName];

    if (toolNameReadable == null)
    {
      return super.getHumanReadableToolAction(toolName, args);
    }

    let toolArgsReadable = '';

    switch (toolName)
    {
      case 'AgentSmith':
      {
        toolArgsReadable = '';
        break;
      }

      default:
      {
        break;
      }
    }

    if (!toolArgsReadable)
    {
      return toolNameReadable;
    }

    return `${toolNameReadable} (${toolArgsReadable})`;
  }

  isInitialized(streamId = undefined)
  {
    if (typeof streamId !== 'string' || !streamId.trim())
    {
      return false;
    }

    const isUsableState = (state) => Boolean(
      state
      && typeof state.negotiatedProtocolVersion === 'string'
      && state.negotiatedProtocolVersion.trim()
      && Array.isArray(state.tools)
      && state.tools.length > 0
      && state.toolNameMap instanceof Map
    );

    return isUsableState(this.streamStates.get(streamId.trim()));
  }

  getTools(streamId = undefined)
  {
    const staticTools = Array.isArray(this.tools) ? this.tools : [];

    if (typeof streamId !== 'string' || !streamId.trim())
    {
      return staticTools;
    }

    const state = this.streamStates.get(streamId.trim());
    const dynamicTools = Array.isArray(state?.tools) ? state.tools : [];

    return [...staticTools, ...dynamicTools];
  }

  async load(context = {})
  {
    const streamId = this._resolveStreamId({}, context, 'load');
    const refresh = context?.refresh === true;
    const state = this._getOrCreateStreamState(streamId);

    if (!refresh && state.negotiatedProtocolVersion !== null)
    {
      return {
        ok: true,
        status: 'already_loaded',
        toolCount: Array.isArray(state.tools) ? state.tools.length : 0,
        negotiatedProtocolVersion: state.negotiatedProtocolVersion,
        sessionId: state.sessionId,
      };
    }

    if (state.loadPromise)
    {
      return await state.loadPromise;
    }

    const loadPromise = this._loadStreamState(streamId);
    state.loadPromise = loadPromise;

    try
    {
      return await loadPromise;
    }
    catch (error)
    {
      if (!this._isConnectionError(error))
      {
        throw error;
      }

      this._scheduleReconnect(streamId, error);

      return {
        ok: false,
        status: 'reconnecting',
        retryInMs: this.reconnectDelayMs,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    finally
    {
      const currentState = this.streamStates.get(streamId);

      if (currentState?.loadPromise === loadPromise)
      {
        currentState.loadPromise = null;
      }
    }
  }

  async execute(toolName, args = {}, context = {})
  {
    const staticTool = this.tools.find((tool) => tool?.name === toolName);

    if (staticTool)
    {
      return await super.execute(toolName, args, context);
    }

    const streamId = this._resolveStreamId({}, context, 'execute');
    const state = this.streamStates.get(streamId);

    if (!state)
    {
      throw new Error(`MCP stream state is not loaded for streamId "${streamId}".`);
    }

    const exposedTool = state.tools.find((tool) => tool?.name === toolName);

    if (!exposedTool)
    {
      throw new Error(`Unsupported tool: ${toolName}`);
    }

    this._validateToolArgs(exposedTool, args);

    const mappedToolName = state.toolNameMap.get(toolName);

    if (mappedToolName === '__reconnect__')
    {
      return await this._executeReconnect(streamId);
    }

    if (typeof mappedToolName !== 'string' || !mappedToolName.trim())
    {
      throw new Error(`Unsupported tool mapping for streamId "${streamId}": ${toolName}`);
    }

    const mcpArgs = await this._prepareMcpToolArguments(mappedToolName, args, context);
    let result;

    try
    {
      result = await this._callTool(streamId, mappedToolName, mcpArgs);
    }
    catch (error)
    {
      if (this._isConnectionError(error))
      {
        this._scheduleReconnect(streamId, error);
        throw error;
      }

      if (!this._isSessionInvalidError(error))
      {
        throw error;
      }

      this._resetStreamState(streamId);
      await this.load({ ...context, refresh: true });
      result = await this._callTool(streamId, mappedToolName, mcpArgs);
    }

    return await this._processMcpToolResult(mappedToolName, result, args, context);
  }

  async _loadStreamState(streamId)
  {
    const runtime = {
      sessionId: null,
      negotiatedProtocolVersion: null,
      nextRequestId: 1,
    };

    const initializeResult = await this._sendJsonRpcRequest(streamId, 'initialize', {
      protocolVersion: this.protocolVersion,
      capabilities: {},
      clientInfo: {
        name: 'AgentSmith',
        version: '1.0.0',
      },
    }, {
      includeMcpHeaders: false,
      captureSessionId: true,
      runtime,
    });

    const negotiatedProtocolVersion = this._normalizeRequiredString(
      initializeResult?.protocolVersion,
      'initialize result.protocolVersion'
    );

    runtime.negotiatedProtocolVersion = negotiatedProtocolVersion;

    const serverInstructions = this._extractServerInstructions(initializeResult);

    await this._sendJsonRpcNotification(streamId, 'notifications/initialized', {}, { runtime });

    const mcpTools = await this._listAllTools(streamId, { runtime });
    const built = this._buildDynamicTools(mcpTools);
    const remoteToolCount = Array.isArray(mcpTools) ? mcpTools.length : 0;
    const previousState = this.streamStates.get(streamId);

    this.streamStates.set(streamId, {
      sessionId: runtime.sessionId,
      negotiatedProtocolVersion,
      serverInstructions,
      tools: built.tools,
      toolNameMap: built.toolNameMap,
      generatedToolNames: built.generatedToolNames,
      loadPromise: previousState?.loadPromise ?? null,
      nextRequestId: runtime.nextRequestId,
    });

    return {
      ok: true,
      status: 'loaded',
      toolCount: remoteToolCount,
      negotiatedProtocolVersion,
      sessionId: runtime.sessionId,
    };
  }

  async _executeReconnect(streamId)
  {
    this._resetStreamState(streamId);
    const loadResult = await this.load({ streamId, refresh: true });

    return {
      status: 'reconnected',
      endpoint: this.endpoint,
      protocolVersion: loadResult?.negotiatedProtocolVersion ?? null,
      toolCount: loadResult?.toolCount ?? 0,
    };
  }

  async _callTool(streamId, mcpToolName, args = {})
  {
    return await this._sendJsonRpcRequest(streamId, 'tools/call', {
      name: mcpToolName,
      arguments: args,
    });
  }

  async _listAllTools(streamId, { runtime } = {})
  {
    const tools = [];
    let cursor = null;

    while (true)
    {
      const params = cursor ? { cursor } : {};
      const result = await this._sendJsonRpcRequest(streamId, 'tools/list', params, { runtime });
      const pageTools = Array.isArray(result?.tools) ? result.tools : [];

      tools.push(...pageTools);

      const nextCursor = typeof result?.nextCursor === 'string' && result.nextCursor.trim()
        ? result.nextCursor.trim()
        : null;

      if (!nextCursor)
      {
        break;
      }

      cursor = nextCursor;
    }

    return tools;
  }

  _buildDynamicTools(mcpTools)
  {
    const prefix = this._sanitizeIdentifier(this.name);
    const generatedToolNames = new Set();
    const toolNameMap = new Map();
    const tools = [];

    const reconnectToolName = `${prefix}_reconnect`;

    generatedToolNames.add(reconnectToolName);
    toolNameMap.set(reconnectToolName, '__reconnect__');

    tools.push({
      type: 'function',
      name: reconnectToolName,
      description: 'Reconnects to the MCP server and creates a new MCP session. Use this tool when another tool from this skill fails because the MCP session is missing, invalid, expired, or disconnected. After reconnecting, retry the original tool call if appropriate.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
    });

    for (const mcpTool of mcpTools)
    {
      const originalMcpToolName = this._normalizeRequiredString(mcpTool?.name, 'mcp tool name');
      const mcpToolDescription = typeof mcpTool?.description === 'string' ? mcpTool.description.trim() : '';
      const mcpToolSchema = mcpTool?.inputSchema && typeof mcpTool.inputSchema === 'object'
        ? mcpTool.inputSchema
        : { type: 'object' };
      const parameters = {
        ...mcpToolSchema,
        properties: mcpToolSchema.properties ?? {},
        required: Array.isArray(mcpToolSchema.required) ? mcpToolSchema.required : [],
      };

      const generatedToolName = this._buildUniqueToolName(prefix, this._sanitizeIdentifier(originalMcpToolName), generatedToolNames);

      generatedToolNames.add(generatedToolName);
      toolNameMap.set(generatedToolName, originalMcpToolName);

      tools.push(this._buildMcpToolDefinition(originalMcpToolName, {
        type: 'function',
        name: generatedToolName,
        description: mcpToolDescription,
        parameters,
        ...(mcpTool?.outputSchema && typeof mcpTool.outputSchema === 'object' ? { outputSchema: mcpTool.outputSchema } : {}),
      }));
    }

    return { tools, toolNameMap, generatedToolNames };
  }

  _buildMcpToolDefinition(mcpToolName, tool)
  {
    return tool;
  }

  async _prepareMcpToolArguments(mcpToolName, args, context = {})
  {
    return args;
  }

  async _processMcpToolResult(mcpToolName, result, originalArgs, context = {})
  {
    return result;
  }

  _buildUniqueToolName(prefix, baseName, existing)
  {
    const root = `${prefix}_${baseName}`;
    let index = 1;
    let candidate = root;

    while (existing.has(candidate))
    {
      index += 1;
      candidate = `${root}_${index}`;
    }

    return candidate;
  }

  _sanitizeIdentifier(value)
  {
    const normalized = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

    const fallback = normalized || 'tool';

    return /^[a-z_]/.test(fallback)
      ? fallback
      : `t_${fallback}`;
  }

  async _sendJsonRpcNotification(streamId, method, params = {}, { runtime } = {})
  {
    const payload = {
      jsonrpc: '2.0',
      method,
      params,
    };

    const body = await this._postJsonRpc(streamId, payload, {
      runtime,
      isNotification: true,
      expectedId: null,
    });

    if (body && typeof body === 'object' && body.error)
    {
      const rpcError = body.error;
      const message = typeof rpcError?.message === 'string' ? rpcError.message : 'Unknown JSON-RPC error';
      const code = Number.isInteger(rpcError?.code) ? ` (code ${rpcError.code})` : '';

      throw new Error(`MCP JSON-RPC error for notification "${method}"${code}: ${message}`);
    }

    return null;
  }

  async _sendJsonRpcRequest(streamId, method, params = {}, options = {})
  {
    const runtime = this._resolveRuntime(streamId, options.runtime, method);
    const id = runtime.nextRequestId++;
    const payload = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    const body = await this._postJsonRpc(streamId, payload, {
      ...options,
      runtime,
      isNotification: false,
      expectedId: id,
    });

    if (!body || typeof body !== 'object')
    {
      throw new Error(`Invalid JSON-RPC response for method "${method}": expected an object.`);
    }

    if (body.id !== id)
    {
      throw new Error(`Invalid JSON-RPC response for method "${method}": response id mismatch (expected ${id}, got ${String(body.id)}).`);
    }

    if ('error' in body && body.error)
    {
      const rpcError = body.error;
      const message = typeof rpcError?.message === 'string' ? rpcError.message : 'Unknown JSON-RPC error';
      const code = Number.isInteger(rpcError?.code) ? ` (code ${rpcError.code})` : '';

      throw new Error(`MCP JSON-RPC error for method "${method}"${code}: ${message}`);
    }

    if (!('result' in body))
    {
      throw new Error(`Invalid JSON-RPC response for method "${method}": missing result.`);
    }

    return body.result;
  }

  async _postJsonRpc(streamId, payload, {
    runtime,
    includeMcpHeaders = true,
    captureSessionId = false,
    isNotification = false,
    expectedId = null,
  } = {})
  {
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };

    if (this.accessToken)
    {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    if (includeMcpHeaders && runtime.negotiatedProtocolVersion)
    {
      headers['MCP-Protocol-Version'] = runtime.negotiatedProtocolVersion;
    }

    if (includeMcpHeaders && runtime.sessionId)
    {
      headers['MCP-Session-Id'] = runtime.sessionId;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try
    {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (captureSessionId)
      {
        const sessionHeader = response.headers.get('MCP-Session-Id');

        if (typeof sessionHeader === 'string' && sessionHeader.trim())
        {
          runtime.sessionId = sessionHeader.trim();
        }
      }

      if (!response.ok)
      {
        const errorText = await response.text().catch(() => '');
        const details = errorText ? ` ${errorText}` : '';
        const httpError = new Error(
          `MCP HTTP error ${response.status} ${response.statusText} for method "${payload.method}".${details}`.trim()
        );

        httpError.status = response.status;
        httpError.statusText = response.statusText;
        httpError.responseBody = errorText;

        throw httpError;
      }

      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      const rawBody = await response.text();

      if (!rawBody.trim())
      {
        return null;
      }

      if (contentType.includes('text/event-stream'))
      {
        return this._parseSseResponse(rawBody, {
          expectedId,
          isNotification,
          method: payload.method,
        });
      }

      if (contentType && !contentType.includes('application/json'))
      {
        throw new Error(
          `Invalid MCP response content-type for method "${payload.method}": "${contentType}". Expected application/json.`
        );
      }

      try
      {
        return JSON.parse(rawBody);
      }
      catch (error)
      {
        throw new Error(`Invalid JSON response for method "${payload.method}": ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    catch (error)
    {
      if (error?.name === 'AbortError')
      {
        throw new Error(`MCP request timeout after ${this.timeout}ms for method "${payload.method}".`);
      }

      if (error instanceof Error)
      {
        error.message = `MCP request failed for method "${payload.method}": ${error.message}`;
        throw error;
      }

      throw new Error(`MCP request failed for method "${payload.method}": ${String(error)}`);
    }
    finally
    {
      clearTimeout(timeoutId);
    }
  }

  _parseSseResponse(rawBody, { expectedId = null, isNotification = false, method = 'unknown' } = {})
  {
    const events = String(rawBody || '')
      .split(/\r?\n\r?\n/)
      .map((chunk) => chunk.trim())
      .filter(Boolean);

    const messages = [];

    for (const eventBlock of events)
    {
      const dataLines = [];

      for (const line of eventBlock.split(/\r?\n/))
      {
        if (!line || line.startsWith(':'))
        {
          continue;
        }

        if (!line.startsWith('data:'))
        {
          continue;
        }

        let value = line.slice('data:'.length);

        if (value.startsWith(' '))
        {
          value = value.slice(1);
        }

        dataLines.push(value);
      }

      if (!dataLines.length)
      {
        continue;
      }

      const dataPayload = dataLines.join('\n').trim();

      if (!dataPayload)
      {
        continue;
      }

      try
      {
        messages.push(JSON.parse(dataPayload));
      }
      catch (error)
      {
        throw new Error(
          `Invalid SSE JSON payload for method "${method}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    if (isNotification)
    {
      return null;
    }

    const match = messages.find((message) => message?.id === expectedId);

    if (!match)
    {
      throw new Error(`No JSON-RPC response with id ${expectedId} found in SSE stream for method "${method}".`);
    }

    return match;
  }

  _resolveRuntime(streamId, runtime, method)
  {
    if (runtime)
    {
      return runtime;
    }

    const state = this.streamStates.get(streamId);

    if (!state)
    {
      throw new Error(`MCP stream state is not loaded for streamId "${streamId}" while calling "${method}".`);
    }

    return state;
  }

  _resetStreamState(streamId)
  {
    const state = this.streamStates.get(streamId);

    if (state?.reconnectTimer)
    {
      clearTimeout(state.reconnectTimer);
    }

    this.streamStates.delete(streamId);
  }

  _scheduleReconnect(streamId, error)
  {
    const state = this._getOrCreateStreamState(streamId);

    if (state.reconnectTimer)
    {
      return;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);

    console.warn(`[McpSkill:${this.name}] connection failed for stream "${streamId}": ${errorMessage}. Retrying in ${this.reconnectDelayMs}ms.`);

    state.reconnectTimer = setTimeout(async () =>
    {
      state.reconnectTimer = null;

      try
      {
        await this.load({ streamId, refresh: true });
      }
      catch (retryError)
      {
        console.error(`[McpSkill:${this.name}] reconnect failed for stream "${streamId}":`, retryError);
      }
    }, this.reconnectDelayMs);

    state.reconnectTimer.unref();
  }

  _createStreamState()
  {
    return {
      sessionId: null,
      negotiatedProtocolVersion: null,
      serverInstructions: null,
      tools: [],
      toolNameMap: new Map(),
      generatedToolNames: new Set(),
      loadPromise: null,
      reconnectTimer: null,
      nextRequestId: 1,
    };
  }

  _getOrCreateStreamState(streamId)
  {
    const existing = this.streamStates.get(streamId);

    if (existing)
    {
      return existing;
    }

    const state = this._createStreamState();
    this.streamStates.set(streamId, state);

    return state;
  }

  _resolveStreamId(options = {}, context = {}, methodLabel = 'McpSkill')
  {
    const streamId = typeof context?.streamId === 'string' && context.streamId.trim()
      ? context.streamId.trim()
      : (typeof options?.streamId === 'string' && options.streamId.trim() ? options.streamId.trim() : '');

    if (!streamId)
    {
      throw new Error(`${methodLabel} requires context.streamId.`);
    }

    return streamId;
  }

  _isSessionInvalidError(error)
  {
    const status = Number.isInteger(error?.status) ? error.status : null;

    if ([400, 401, 403, 404, 409, 410, 412].includes(status))
    {
      return true;
    }

    const message = String(error?.message || '').toLowerCase();

    return message.includes('session')
      || message.includes('mcp-session-id')
      || message.includes('notifications/initialized')
      || message.includes('initialize');
  }

  _isConnectionError(error)
  {
    if ([408, 425, 429, 500, 502, 503, 504].includes(error?.status))
    {
      return true;
    }

    const message = String(error?.message || '').toLowerCase();

    return message.includes('fetch failed')
      || message.includes('network')
      || message.includes('econnrefused')
      || message.includes('econnreset')
      || message.includes('enotfound')
      || message.includes('socket')
      || message.includes('request timeout');
  }

  _validateToolArgs(tool, args)
  {
    const parameters = tool?.parameters ?? {};
    const properties = parameters?.properties ?? {};
    const required = Array.isArray(parameters?.required) ? parameters.required : [];
    const additionalProperties = parameters?.additionalProperties;

    if (!args || typeof args !== 'object' || Array.isArray(args))
    {
      throw new Error(`Invalid arguments for tool "${tool?.name}": expected a JSON object.`);
    }

    for (const requiredKey of required)
    {
      if (!(requiredKey in args))
      {
        throw new Error(`Invalid call to tool "${tool?.name}": missing required argument "${requiredKey}".`);
      }
    }

    if (additionalProperties === false)
    {
      for (const key of Object.keys(args))
      {
        if (!(key in properties))
        {
          throw new Error(`Invalid call to tool "${tool?.name}": unexpected argument "${key}".`);
        }
      }
    }
  }

  _extractServerInstructions(initializeResult)
  {
    if (typeof initializeResult?.instructions === 'string' && initializeResult.instructions.trim())
    {
      return initializeResult.instructions.trim();
    }

    if (typeof initializeResult?.serverInstructions === 'string' && initializeResult.serverInstructions.trim())
    {
      return initializeResult.serverInstructions.trim();
    }

    if (typeof initializeResult?.serverInfo?.instructions === 'string' && initializeResult.serverInfo.instructions.trim())
    {
      return initializeResult.serverInfo.instructions.trim();
    }

    return '';
  }

  _normalizeRequiredString(value, label)
  {
    if (typeof value !== 'string')
    {
      throw new Error(`Invalid ${label}: expected a non-empty string.`);
    }

    const normalized = value.trim();

    if (!normalized)
    {
      throw new Error(`Invalid ${label}: expected a non-empty string.`);
    }

    return normalized;
  }

  _normalizeEndpoint(endpoint)
  {
    const normalized = this._normalizeRequiredString(endpoint, 'endpoint');
    let parsed;

    try
    {
      parsed = new URL(normalized);
    }
    catch
    {
      throw new Error('Invalid endpoint: expected an absolute HTTP or HTTPS URL.');
    }

    if (!['http:', 'https:'].includes(parsed.protocol))
    {
      throw new Error('Invalid endpoint: expected an absolute HTTP or HTTPS URL.');
    }

    return parsed.toString();
  }

  _normalizeTimeout(timeout)
  {
    if (!Number.isFinite(timeout) || timeout <= 0)
    {
      throw new Error('Invalid timeout: expected a positive number.');
    }

    return Math.floor(timeout);
  }
}