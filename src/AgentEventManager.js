/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { AgentUtils } from './AgentUtils.js';
import { AgentAgent } from './app/db/models/AgentAgent.js';
import { AgentChannel } from './app/db/models/AgentChannel.js';
import { AgentEvent } from './app/db/models/AgentEvent.js';
import { AgentStream } from './app/db/models/AgentStream.js';
import { DbQueryAgentEvents } from './app/db/queries/DbQueryAgentEvents.js';
import { DbQueryAgentStream } from './app/db/queries/DbQueryAgentStream.js';

export class AgentEventManager
{
  constructor(agent, {
    eventSizeWarningBytes = 20000*3.5, //env 20k tokens
  } = {})
  {
    if (!agent)
    {
      throw new Error('AgentEventManager requires an agent instance');
    }

    this.agent = agent;
    this.agentUuid = null;
    this.eventSizeWarningBytes = eventSizeWarningBytes;
  }

  async load()
  {
    if (!this.agent.agentUid)
    {
      throw new Error('agentUid is required.');
    }

    const agent = new AgentAgent();

    try
    {
      await agent.search('"uid" = $1', [this.agent.agentUid], { limit: 1 });

      if (!(await agent.next()))
      {
        throw new Error(`Unknown agent uid: ${this.agent.agentUid}. Add it with the Agent Smith CLI first.`);
      }

      this.agentUuid = agent.uuid;
    }
    finally
    {
      agent.close();
    }
  }

  async push(event)
  {
    if (!event?.streamId)
    {
      throw new Error('streamId is required');
    }

    let pushedEvent = {
      ...event,
      createdAt: event.createdAt ?? new Date().toISOString(),
    };

    if (this.#containsNul(pushedEvent.data))
    {
      const rejectedData = {
        rejectedType: pushedEvent.type,
        cause: 'Event data contains a NUL character unsupported by PostgreSQL JSONB',
      };

      if (pushedEvent.type === 'tool_result')
      {
        rejectedData.toolName = pushedEvent.data?.name ?? '[unknown]';
        rejectedData.callId = pushedEvent.data?.call_id ?? '[unknown]';
      }

      pushedEvent = {
        type: 'rejected_event',
        source: pushedEvent.source,
        streamId: pushedEvent.streamId,
        createdAt: pushedEvent.createdAt,
        data: rejectedData,
      };
    }

    const eventSizeBytes = Buffer.byteLength(
      AgentUtils.stringifyForPrompt(pushedEvent),
      'utf8'
    );

    if (this.eventSizeWarningBytes > 0 && eventSizeBytes > this.eventSizeWarningBytes)
    {
      console.warn(
        `[AgentEventManager] Large event truncated: streamId=${pushedEvent.streamId}, ` +
        `type=${pushedEvent.type}, ` +
        `size=${eventSizeBytes} bytes, limit=${this.eventSizeWarningBytes} bytes`
      );

      const omitted = {
        omitted: true,
        reason: 'EVENT_TOO_LARGE',
        originalSizeBytes: eventSizeBytes,
        maxSizeBytes: this.eventSizeWarningBytes,
      };

      if (pushedEvent.type === 'tool_call')
      {
        const originalToolCalls = Array.isArray(pushedEvent.data) ? pushedEvent.data : [];

        pushedEvent = {
          ...pushedEvent,
          data: originalToolCalls.map((toolCall) =>
          {
            const callId = String(toolCall?.call_id ?? '').trim();
            const toolName = String(toolCall?.name ?? '').trim() || '[unknown]';

            return {
              call_id: callId || '[unknown]',
              name: toolName,
              arguments: JSON.stringify(omitted),
            };
          }),
        };
      }
      else if (pushedEvent.type === 'tool_result')
      {
        pushedEvent = {
          ...pushedEvent,
          data: {
            ...pushedEvent.data,
            result: omitted,
          },
        };
      }
      else
      {
        pushedEvent = {
          ...pushedEvent,
          data: omitted,
        };
      }
    }

    const { type, source, streamId, createdAt, ...eventData } = pushedEvent;
    const channelUid = String(pushedEvent.channel ?? pushedEvent.source ?? '').trim();
    const stream = await this.resolveStream(channelUid, pushedEvent.streamId);
    const dbEvent = new AgentEvent();
    dbEvent.streamUuid = stream.uuid;
    dbEvent.type = type;
    dbEvent.data = eventData;
    dbEvent.active = true;
    await dbEvent.save(true);
    pushedEvent.uuid = dbEvent.uuid;
    pushedEvent.createdAt = dbEvent.createdAt;

    return pushedEvent;
  }

  #containsNul(value)
  {
    if (typeof value === 'string')
    {
      return value.includes('\0');
    }

    if (Array.isArray(value))
    {
      return value.some((item) => this.#containsNul(item));
    }

    if (value && typeof value === 'object')
    {
      return Object.values(value).some((item) => this.#containsNul(item));
    }

    return false;
  }

  async getLastEvents(channelUid, streamId, limit = null)
  {
    return await this.getEvents(channelUid, streamId, { activeOnly: true, limit });
  }

  async getEvents(channelUid, streamId, { activeOnly = true, limit = null } = {})
  {
    const stream = await this.resolveStream(channelUid, streamId, { create: false });

    if (!stream)
    {
      return [];
    }

    const query = new DbQueryAgentEvents();
    const where = activeOnly ? '"stream_uuid" = $1 AND "active" = TRUE' : '"stream_uuid" = $1';
    const events = [];

    try
    {
      await query.search(where, [stream.uuid], { order: limit == null ? '"sequence" ASC' : '"sequence" DESC', limit });

      while (await query.next())
      {
        events.push({
          ...query.event.data,
          uuid: query.event.uuid,
          type: query.event.type,
          source: channelUid,
          streamId,
          createdAt: query.event.createdAt,
        });
      }
    }
    finally
    {
      query.close();
    }

    return limit == null ? events : events.reverse();
  }

  async resolveStream(channelUid, streamId, { create = true } = {})
  {
    const query = new DbQueryAgentStream();

    try
    {
      await query.search('"agent_uid" = $1 AND "channel_uid" = $2 AND "stream_id" = $3', [
        this.agent.agentUid,
        channelUid,
        streamId,
      ], { limit: 1 });

      if (await query.next())
      {
        const stream = new AgentStream();
        stream.fromRow({
          uuid: query.stream.uuid,
          agent_uuid: query.stream.agentUuid,
          channel_uuid: query.stream.channelUuid,
          stream_id: query.stream.streamId,
          created_at: query.stream.createdAt,
          updated_at: query.stream.updatedAt,
        });
        return stream;
      }
    }
    finally
    {
      query.close();
    }

    if (!create)
    {
      return null;
    }

    const channel = new AgentChannel();
    let channelUuid;

    try
    {
      await channel.search('"uid" = $1', [channelUid], { limit: 1 });

      if (!(await channel.next()))
      {
        throw new Error(`Unknown channel uid: ${channelUid}.`);
      }

      channelUuid = channel.uuid;
    }
    finally
    {
      channel.close();
    }

    const stream = new AgentStream();
    stream.agentUuid = this.agentUuid;
    stream.channelUuid = channelUuid;
    stream.streamId = streamId;

    try
    {
      await stream.save(true);
      return stream;
    }
    catch (error)
    {
      const code = String(error?.originalError?.code ?? error?.originalError?.originalError?.code ?? error?.code ?? '');

      if (code !== '23505')
      {
        throw error;
      }

      return await this.resolveStream(channelUid, streamId, { create: false });
    }
  }

  async buildStreamEventsPrompt(channelUid, streamId, limit = null)
  {
    const allEvents = await this.getLastEvents(channelUid, streamId, limit);
    return this.buildEventsPrompt(allEvents);
  }

  buildEventsPrompt(allEvents)
  {
    const messages = [];
    const toolResultsByCallId = this.#buildToolResultEventMap(allEvents);
    const consumedToolResultEvents = new Set();

    for (let index = 0; index < allEvents.length; index++)
    {
      const event = allEvents[index];
      const type = String(event.type || '');

      if (type === 'tool_call')
      {
        const toolCalls = Array.isArray(event.data) ? event.data : [];
        const assistantMessage = {
          role: 'assistant',
          // name: event.senderName || this.agent?.name || 'assistant',
          content: null,
          tool_calls: toolCalls.map((toolCall) => ({
            id: toolCall.call_id,
            type: 'function',
            function: {
              name: toolCall.name,
              arguments: typeof toolCall.arguments === 'string'
                ? toolCall.arguments
                : JSON.stringify(toolCall.arguments ?? {}),
            },
          })),
        };

        messages.push(assistantMessage);

        for (const toolCall of toolCalls)
        {
          const toolResultEvent = this.#takeToolResultEventForCallId(
            toolResultsByCallId,
            toolCall?.call_id,
            consumedToolResultEvents,
          );

          if (toolResultEvent)
          {
            this.#appendToolResultMessage(messages, toolResultEvent);
          }
        }

        continue;
      }

      if (type === 'tool_result')
      {
        if (consumedToolResultEvents.has(event))
        {
          continue;
        }

        consumedToolResultEvents.add(event);
        this.#appendToolResultMessage(messages, event);

        continue;
      }

      if (type === 'rejected_event' && event.data?.rejectedType === 'tool_result')
      {
        if (consumedToolResultEvents.has(event))
        {
          continue;
        }

        consumedToolResultEvents.add(event);
        this.#appendToolResultMessage(messages, event);
        continue;
      }

      if (type === 'input_message')
      {
        const senderName = event.senderName || event.senderId || 'Unknown';
        const channel = event.channel || event.source || 'unknown';
        const streamId = event.streamId || 'unknown';
        const messageId = event.messageId || '[unknown]';
        const timestamp = event.timestamp || event.createdAt || 'unknown';
        const parentMessageId = String(event.parentMessageId ?? '').trim();

        const contentParts = [
          `<message channel="${AgentUtils.escapeXmlAttribute(channel)}" streamId="${AgentUtils.escapeXmlAttribute(streamId)}" messageId="${AgentUtils.escapeXmlAttribute(messageId)}" senderId="${AgentUtils.escapeXmlAttribute(event.senderId || 'unknown')}" senderName="${AgentUtils.escapeXmlAttribute(senderName)}" timestamp="${AgentUtils.escapeXmlAttribute(timestamp)}"${parentMessageId ? ` parentMessageId="${AgentUtils.escapeXmlAttribute(parentMessageId)}"` : ''}>`,
        ];

        if (event.data?.omitted === true)
        {
          contentParts.push(
            `<omitted reason="${AgentUtils.escapeXmlAttribute(event.data.reason || 'unknown')}" originalSizeBytes="${AgentUtils.escapeXmlAttribute(String(event.data.originalSizeBytes ?? 0))}" maxSizeBytes="${AgentUtils.escapeXmlAttribute(String(event.data.maxSizeBytes ?? 0))}" />`,
          );
        }
        else
        {
          const content = typeof event.data === 'string'
            ? event.data.trim()
            : AgentUtils.stringifyForPrompt(event.data);

          contentParts.push(`<![CDATA[${AgentUtils.escapeCdata(content)}]]>`);
        }

        contentParts.push(`</message>`);

        messages.push({
          role: 'user',
          // name: senderName,
          content: contentParts.join('\n'),
        });

        continue;
      }

      if (['input_file', 'input_image', 'input_audio'].includes(type))
      {
        const data = event.data || {};
        const senderName = event.senderName || event.senderId || 'Unknown';
        const channel = event.channel || event.source || 'unknown';
        const streamId = event.streamId || 'unknown';
        const messageId = event.messageId || '[unknown]';
        const timestamp = event.timestamp || data.timestamp || event.createdAt || 'unknown';
        const parentMessageId = event.parentMessageId || data.parentMessageId || '';

        const contentParts = [
          `<message type="file" channel="${AgentUtils.escapeXmlAttribute(channel)}" streamId="${AgentUtils.escapeXmlAttribute(streamId)}" messageId="${AgentUtils.escapeXmlAttribute(messageId)}" senderId="${AgentUtils.escapeXmlAttribute(event.senderId || 'unknown')}" senderName="${AgentUtils.escapeXmlAttribute(senderName)}" timestamp="${AgentUtils.escapeXmlAttribute(timestamp)}" parentMessageId="${AgentUtils.escapeXmlAttribute(parentMessageId)}">`,
        ];

        const size = Number.isFinite(data.size) ? data.size : 0;

        contentParts.push(
          `<file tempFileName="${AgentUtils.escapeXmlAttribute(data.tempFileName || 'unknown')}" fileName="${AgentUtils.escapeXmlAttribute(data.fileName || data.tempFileName || 'unknown')}" mimeType="${AgentUtils.escapeXmlAttribute(data.mimeType || 'unknown')}" size="${AgentUtils.escapeXmlAttribute(String(size))}" ref="${AgentUtils.escapeXmlAttribute(data.ref || 'unknown')}" />`,
          `</message>`
        );

        messages.push({
          role: 'user',
          // name: senderName,
          content: contentParts.join('\n'),
        });

        continue;
      }

      if (type === 'input_reaction')
      {
        const data = event.data || {};
        const senderName = event.senderName || event.senderId || 'Unknown';
        const channel = event.channel || event.source || 'unknown';
        const streamId = event.streamId || 'unknown';
        const messageId = event.messageId || '[unknown]';
        const timestamp = event.timestamp || data.timestamp || event.createdAt || 'unknown';
        const parentMessageId = event.parentMessageId || data.parentMessageId || '';
        const reactionKey = typeof data.reactionKey === 'string' && data.reactionKey.trim()
          ? data.reactionKey.trim()
          : '[unknown]';

        messages.push({
          role: 'user',
          content: `<message type="reaction" channel="${AgentUtils.escapeXmlAttribute(channel)}" streamId="${AgentUtils.escapeXmlAttribute(streamId)}" messageId="${AgentUtils.escapeXmlAttribute(messageId)}" senderId="${AgentUtils.escapeXmlAttribute(event.senderId || 'unknown')}" senderName="${AgentUtils.escapeXmlAttribute(senderName)}" timestamp="${AgentUtils.escapeXmlAttribute(timestamp)}" parentMessageId="${AgentUtils.escapeXmlAttribute(parentMessageId)}"><![CDATA[${AgentUtils.escapeCdata(reactionKey)}]]></message>`,
        });

        continue;
      }

      if (type === 'output_message' || type === 'output_file')
      {
        // Output events are already represented by tool_call/tool_result messages.
        // Keeping them as assistant text can nudge the model to continue its own prior response.
        continue;
      }

      if (type === 'protocol_error')
      {
        const data = event.data || {};
        const reason = AgentUtils.escapeXmlAttribute(data.reason || 'unknown');
        const protocolErrorText = [
          typeof data.error === 'string' ? data.error.trim() : '',
          typeof data.message === 'string' ? data.message.trim() : '',
        ].filter(Boolean).join('\n\n');

        messages.push({
          role: 'user',
          content: protocolErrorText
            ? `<protocol_error reason="${reason}">\n${AgentUtils.escapeXmlText(protocolErrorText)}\n</protocol_error>`
            : `<protocol_error reason="${reason}"></protocol_error>`,
        });

        continue;
      }
    }

    return this.#validateToolCallPairs(messages);
  }


  async compressStream(channelUid, streamId, targetSize)
  {
    const events = await this.getLastEvents(channelUid, streamId);
    const maxToolEvents = 30;
    const targetContextSize = Math.max(0, Math.ceil(targetSize));

    if (!events?.length)
    {
      return 0;
    }

    /*
    * Build:
    *   callId -> tool_call event
    *   tool_call event -> tool_result events[]
    */
    const toolEventByCallId = new Map();
    const toolResultsByToolEvent = new Map();
    const protectedToolEvents = new Set();

    let unprotectedToolEventCount = 0;
    for (const event of events)
    {
      if (event.type === 'tool_call')
      {
        let isProtectedToolEvent = false;
        toolResultsByToolEvent.set(event, []);

        for (const toolCall of event.data ?? [])
        {
          if (toolCall?.call_id)
          {
            toolEventByCallId.set(toolCall.call_id, event);
          }

          const toolName = String(toolCall?.name || '').split('.').at(-1);
          const skill = this.agent.findSkillByToolName(toolName);

          if (skill?.keepToolCallsOnCompression === true)
          {
            isProtectedToolEvent = true;
          }
        }

        if (isProtectedToolEvent)
        {
          protectedToolEvents.add(event);
        }
        else
        {
          unprotectedToolEventCount++;
        }
      }
      else if (event.type === 'tool_result' || (event.type === 'rejected_event' && event.data?.rejectedType === 'tool_result'))
      {
        const toolEvent = toolEventByCallId.get(event.data?.call_id ?? event.data?.callId);

        if (toolEvent)
        {
          toolResultsByToolEvent.get(toolEvent)?.push(event);
        }
      }
    }

    for (const toolEvent of protectedToolEvents)
    {
      for (const resultEvent of toolResultsByToolEvent.get(toolEvent) ?? [])
      {
        protectedToolEvents.add(resultEvent);
      }
    }

    const removeEvent = (event) =>
    {
      const index = events.indexOf(event);

      if (index !== -1)
      {
        events.splice(index, 1);
        removedEventUuids.add(event.uuid);
        removedEventCount++;
      }
    };

    const removeToolEvent = (toolEvent) =>
    {
      for (const resultEvent of toolResultsByToolEvent.get(toolEvent) ?? [])
      {
        removeEvent(resultEvent);
      }

      removeEvent(toolEvent);
    };

    const agentInput = this.agent.getInputBySource(channelUid);
    const initialSize = await this.#getContextCharSize(streamId, null, agentInput);
    let currentSize = initialSize;
    let removedEventCount = 0;
    const removedEventUuids = new Set();

    /*
    * First pass:
    * keep all normal and protected events, and keep at most the 30 most
    * recent non-protected tool events.
    */
    for (
      let index = 0;
      index < events.length &&
      unprotectedToolEventCount > maxToolEvents &&
      currentSize > targetContextSize;
    )
    {
      const event = events[index];

      if (event.type === 'tool_call')
      {
        if (protectedToolEvents.has(event))
        {
          index++;
          continue;
        }

        removeToolEvent(event);
        unprotectedToolEventCount--;
        currentSize = await this.#getContextCharSize(streamId, events, agentInput);
      }
      else
      {
        index++;
      }
    }

    /*
    * Second pass:
    * remove oldest events until target size is reached.
    * Messages and protected tools lose their priority only in this pass.
    * Tool calls and all their results are always removed together.
    */
    while (events.length && currentSize > targetContextSize)
    {
      const event = events[0];

      if (event.type === 'tool_call')
      {
        removeToolEvent(event);
      }
      else
      {
        removeEvent(event);
      }

      currentSize = await this.#getContextCharSize(streamId, events, agentInput);
    }

    if (removedEventCount > 0)
    {
      const query = new DbQueryAgentEvents();

      try
      {
        await query.search('"uuid" = ANY($1::uuid[])', [[...removedEventUuids]]);

        while (await query.next())
        {
            query.event.active = false;
          await query.event.save();
        }
      }
      finally
      {
        query.close();
      }
    }

    return Math.max(0, initialSize - currentSize);
  }

  async #getContextCharSize(streamId, events = null, agentInput = null)
  {
    const context = events
      ? await this.agent.getContext(streamId, this.buildEventsPrompt(events), agentInput)
      : await this.agent.getContext(streamId, null, agentInput);
    const tools = this.agent.buildModelTools(context.loadedSkillNames, streamId);
    const body = this.agent.openAIClient.buildRequest({
      instructions: context.systemPrompt,
      input: context.userPrompt,
      tools,
    });

    return this.agent.openAIClient.serializeContextForTokenEstimate(body).length;
  }

  #buildToolResultEventMap(allEvents)
  {
    const map = new Map();

    for (const event of allEvents)
    {
      if (String(event?.type || '') !== 'tool_result' && !(event?.type === 'rejected_event' && event.data?.rejectedType === 'tool_result'))
      {
        continue;
      }

      const callId = String(event?.data?.call_id ?? event?.data?.callId ?? '').trim();

      if (!callId)
      {
        continue;
      }

      const list = map.get(callId) ?? [];
      list.push(event);
      map.set(callId, list);
    }

    return map;
  }

  #takeToolResultEventForCallId(toolResultMap, callId, consumedEvents)
  {
    const normalizedCallId = String(callId || '').trim();

    if (!normalizedCallId)
    {
      return null;
    }

    const list = toolResultMap.get(normalizedCallId) ?? [];

    while (list.length > 0)
    {
      const next = list.shift();

      if (!consumedEvents.has(next))
      {
        consumedEvents.add(next);
        return next;
      }
    }

    return null;
  }

  #appendToolResultMessage(messages, event)
  {
    const data = event?.data ?? {};
    const rejected = event?.type === 'rejected_event';
    const toolName = String(data.name ?? data.toolName ?? '');
    const toolResult = rejected ? data.cause : data.result;
    const hasError = toolResult?.ok === false && toolResult.error != null;
    const durationMs = Number.isFinite(data.durationMs) ? data.durationMs : null;
    let payload = hasError ? toolResult.error : toolResult;

    if (durationMs !== null)
    {
      if (payload && typeof payload === 'object' && !Array.isArray(payload))
      {
        payload = {
          ...payload,
          durationMs,
        };
      }
      else
      {
        payload = {
          result: payload,
          durationMs,
        };
      }
    }

    messages.push({
      role: 'tool',
      tool_call_id: data.call_id ?? data.callId ?? '[unknown]',
      content: AgentUtils.formatToolResult(payload),
    });
  }

  /**
   * Validates that every role:"tool" message has a matching preceding
   * assistant tool_calls message, and that every assistant tool call
   * (except the final pending action) has a corresponding tool result.
   * Removes orphan tool results and orphan tool calls.
   */
  #validateToolCallPairs(messages)
  {
    if (!messages.length)
    {
      return messages;
    }

    // Collect all tool call IDs from assistant messages
    const assistantToolCallIds = new Set();

    for (const message of messages)
    {
      if (message.role === 'assistant' && Array.isArray(message.tool_calls))
      {
        for (const toolCall of message.tool_calls)
        {
          if (toolCall.id)
          {
            assistantToolCallIds.add(toolCall.id);
          }
        }
      }
    }

    // Collect tool_call_ids from tool messages that have a matching assistant tool call
    const resolvedToolCallIds = new Set();

    for (const message of messages)
    {
      if (message.role === 'tool'
        && message.tool_call_id
        && assistantToolCallIds.has(message.tool_call_id))
      {
        resolvedToolCallIds.add(message.tool_call_id);
      }
    }

    const lastIndex = messages.length - 1;
    const validated = [];

    for (let index = 0; index < messages.length; index++)
    {
      const message = messages[index];
      const isLast = index === lastIndex;

      if (message.role === 'tool')
      {
        // Only keep if tool_call_id is non-empty and matches a known assistant tool call
        if (message.tool_call_id && assistantToolCallIds.has(message.tool_call_id))
        {
          validated.push(message);
        }

        // else: orphan tool result — skip
        continue;
      }

      if (message.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length > 0)
      {
        // Split tool calls into those with matching results and those without
        const matched = message.tool_calls.filter((tc) => resolvedToolCallIds.has(tc.id));
        const unmatched = message.tool_calls.filter((tc) => !resolvedToolCallIds.has(tc.id));

        // If this is the final message, keep all tool calls (pending action)
        if (isLast)
        {
          validated.push(message);
          continue;
        }

        // Not the final message: every tool call must have a result
        if (matched.length === 0)
        {
          // No tool calls have results — if there is text content, keep as plain assistant message
          if (message.content != null)
          {
            validated.push({
              role: 'assistant',
              // name: message.name,
              content: message.content,
            });
          }

          // else: skip entirely
          continue;
        }

        // Keep only matched tool calls; drop unmatched ones
        validated.push({
          role: 'assistant',
          // name: message.name,
          content: message.content,
          tool_calls: matched,
        });
        continue;
      }

      validated.push(message);
    }

    // Ensure the first message is never an orphan role:"tool"
    while (validated.length > 0 && validated[0].role === 'tool')
    {
      validated.shift();
    }

    return validated;
  }

  #applyLimit(list, limit)
  {
    if (!limit || limit <= 0)
    {
      return list;
    }

    return list.slice(-limit);
  }
}
