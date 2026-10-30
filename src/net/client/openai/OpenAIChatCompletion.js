/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { OpenAIClient } from './OpenAIClient.js';

export class OpenAIChatCompletion extends OpenAIClient
{
  constructor({
    apiKey,
    url = 'https://api.openai.com/',
    request = {},
    averageCharsPerToken = 3.6,
    stream = false,
  } = {})
  {
    super({ apiKey, url });

    this.request = {
      model: 'gpt-4o-mini',
      ...request,
    };

    this.averageCharsPerToken = averageCharsPerToken;
    this.stream = stream;
  }

  updateAverageCharsPerTokenFromUsage(requestBody, payload)
  {
    const promptTokens = Number(payload?.usage?.prompt_tokens ?? payload?.usage?.input_tokens ?? 0);

    if (!Number.isFinite(promptTokens) || promptTokens <= 0)
    {
      return;
    }

    const serializedContext = this.serializeContextForTokenEstimate(requestBody);
    const observedAverageCharsPerToken = serializedContext.length / promptTokens;

    if (!Number.isFinite(observedAverageCharsPerToken) || observedAverageCharsPerToken <= 0)
    {
      return;
    }

    const currentAverageCharsPerToken = Number(this.averageCharsPerToken);
    // const diff = observedAverageCharsPerToken - currentAverageCharsPerToken;
    this.averageCharsPerToken = observedAverageCharsPerToken;
  }

  sanitizeMessages(messages)
  {
    if (!Array.isArray(messages))
    {
      return messages;
    }

    return messages.map((message) =>
    {
      const cleanMessage = { ...message };

      if (
        Array.isArray(cleanMessage.tool_calls)
        && cleanMessage.tool_calls.length === 0
      )
      {
        delete cleanMessage.tool_calls;
      }

      return cleanMessage;
    });
  }

  static extractOutputText(response)
  {
    const content = response?.choices?.[0]?.message?.content;

    if (typeof content === 'string')
    {
      return content.trim();
    }

    if (Array.isArray(content))
    {
      return content
        .map((item) =>
        {
          if (typeof item === 'string')
          {
            return item;
          }

          return typeof item?.text === 'string'
            ? item.text
            : '';
        })
        .join('\n')
        .trim();
    }

    return '';
  }

  decodeHtmlEntities(text)
  {
    return String(text ?? '')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&apos;', "'")
      .replaceAll('&amp;', '&');
  }

  extractEmbeddedToolCalls(content)
  {
    const toolCalls = [];
    let cleanedContent = String(content ?? '');

    for (const match of cleanedContent.matchAll(
      /<tool_call>([\s\S]*?)<\/tool_call>/g
    ))
    {
      try
      {
        const raw = JSON.parse(match[1]);

        if (!raw?.name)
        {
          continue;
        }

        toolCalls.push({
          id: `call_${toolCalls.length + 1}`,
          type: 'function',
          function:
          {
            name: raw.name,
            arguments: typeof raw.arguments === 'string'
              ? raw.arguments
              : JSON.stringify(raw.arguments ?? {}),
          },
        });
      }
      catch
      {
        const functionMatch = match[1].match(
          /<function\b([^>]*)>([\s\S]*?)<\/function>/i
        );

        if (!functionMatch)
        {
          continue;
        }

        const functionAttrs = functionMatch[1] ?? '';
        const functionBody = functionMatch[2] ?? '';

        const nameMatch = functionAttrs.match(
          /\bname=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
        );

        const toolName = this.decodeHtmlEntities(
          nameMatch?.[1]
          ?? nameMatch?.[2]
          ?? nameMatch?.[3]
          ?? ''
        ).trim();

        if (!toolName)
        {
          continue;
        }

        const argumentsObject = {};

        for (const paramMatch of functionBody.matchAll(
          /<param\b([^>]*)>([\s\S]*?)<\/param>/gi
        ))
        {
          const paramAttrs = paramMatch[1] ?? '';
          const paramBody = paramMatch[2] ?? '';

          const paramNameMatch = paramAttrs.match(
            /\bname=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
          );

          const paramName = this.decodeHtmlEntities(
            paramNameMatch?.[1]
            ?? paramNameMatch?.[2]
            ?? paramNameMatch?.[3]
            ?? ''
          ).trim();

          if (!paramName)
          {
            continue;
          }

          argumentsObject[paramName] = this.decodeHtmlEntities(
            paramBody.trim()
          );
        }

        toolCalls.push({
          id: `call_${toolCalls.length + 1}`,
          type: 'function',
          function:
          {
            name: toolName,
            arguments: JSON.stringify(argumentsObject),
          },
        });
      }
    }

    cleanedContent = cleanedContent
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
      .trim();

    for (const match of cleanedContent.matchAll(
      /<assistant\b([^>]*)>([\s\S]*?)<\/assistant>/gi
    ))
    {
      const attrs = match[1] ?? '';
      const body = match[2] ?? '';

      const toMatch = attrs.match(
        /\bto=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
      );

      const toolName =
        toMatch?.[1]
        ?? toMatch?.[2]
        ?? toMatch?.[3];

      if (!toolName)
      {
        continue;
      }

      toolCalls.push({
        id: `call_${toolCalls.length + 1}`,
        type: 'function',
        function:
        {
          name: toolName,
          arguments: body.trim()
            ? this.decodeHtmlEntities(body.trim())
            : '{}',
        },
      });
    }

    cleanedContent = cleanedContent
      .replace(/<assistant\b[^>]*>[\s\S]*?<\/assistant>/gi, '')
      .trim();

    return {
      content: cleanedContent,
      toolCalls,
    };
  }

  extractBracketToolCalls(content)
  {
    const toolCalls = [];

    const cleanedContent = String(content ?? '')
      .replace(
        /\[tool_call\s+name=([^\]]+)\]\s*([\s\S]*?)\s*\[\/tool_call\]/g,
        (fullMatch, name, argumentsText) =>
        {
          try
          {
            JSON.parse(argumentsText);

            toolCalls.push({
              id: `call_${toolCalls.length + 1}`,
              type: 'function',
              function:
              {
                name: name.trim(),
                arguments: argumentsText,
              },
            });

            return '';
          }
          catch
          {
            return fullMatch;
          }
        }
      )
      .trim();

    return {
      content: cleanedContent,
      toolCalls,
    };
  }

  normalizeMessageToolCalls(message)
  {
    if (
      !message
      || message.tool_calls?.length
      || typeof message.content !== 'string'
      || !message.content.trim()
    )
    {
      return message;
    }

    let normalized = this.extractEmbeddedToolCalls(message.content);

    if (!normalized.toolCalls.length)
    {
      normalized = this.extractBracketToolCalls(message.content);
    }

    if (!normalized.toolCalls.length)
    {
      return message;
    }

    message.tool_calls = normalized.toolCalls;
    message.content = normalized.content || '';

    return message;
  }

  normalizeToolCallOutput(payload)
  {
    for (const choice of payload?.choices ?? [])
    {
      this.normalizeMessageToolCalls(choice.message);
    }

    return payload;
  }

  buildMessages(options = {})
  {
    const messages = [];

    if (options.instructions != null)
    {
      messages.push({
        role: 'system',
        content: options.instructions,
      });
    }

    if (options.input != null)
    {
      if (Array.isArray(options.input))
      {
        messages.push(...options.input);
      }
      else
      {
        messages.push({
          role: 'user',
          content: options.input,
        });
      }
    }

    if (Array.isArray(options.messages))
    {
      messages.push(...options.messages);
    }

    const filteredMessages = messages.filter((message) =>
    {
      if (!message)
      {
        return false;
      }

      if (
        Array.isArray(message.tool_calls)
        && message.tool_calls.length
      )
      {
        return true;
      }

      if (message.role === 'tool')
      {
        return true;
      }

      if (typeof message.content === 'string')
      {
        return message.content.trim().length > 0;
      }

      return message.content != null;
    });

    return this.sanitizeMessages(filteredMessages);
  }

  buildRequest(options = {})
  {
    const requestOptions =
      options.request
      && typeof options.request === 'object'
      && !Array.isArray(options.request)
        ? options.request
        : {};

    const body = {
      ...this.request,
      ...requestOptions,
    };

    if ('model' in options)
    {
      body.model = options.model;
    }

    if ('metadata' in options)
    {
      body.metadata = options.metadata;
    }

    if ('response_format' in options)
    {
      body.response_format = options.response_format;
    }

    if ('reasoning_effort' in options)
    {
      body.reasoning_effort = options.reasoning_effort;
    }

    if ('temperature' in options)
    {
      body.temperature = options.temperature;
    }

    if ('top_p' in options)
    {
      body.top_p = options.top_p;
    }

    if ('max_tokens' in options)
    {
      body.max_tokens = options.max_tokens;
    }
    else if ('max_output_tokens' in options)
    {
      body.max_tokens = options.max_output_tokens;
    }

if ('extra_body' in options)
{
  body.extra_body = options.extra_body;
}

if ('allowed_openai_params' in options)
{
  body.allowed_openai_params = options.allowed_openai_params;
}

if ('reasoning' in options)
{
  body.reasoning = options.reasoning;
}

if ('thinking' in options)
{
  body.thinking = options.thinking;
}

if ('user_id' in options)
{
  body.user_id = options.user_id;
}

if ('session_id' in options)
{
  body.session_id = options.session_id;
}

if ('max_completion_tokens' in options)
{
  body.max_completion_tokens = options.max_completion_tokens;
}    

    const tools =
      Array.isArray(options.tools) && options.tools.length === 0
        ? undefined
        : options.tools;

    body.messages = this.buildMessages(options);
    body.tools = tools;
    body.tool_choice =
      tools != null
        ? options.tool_choice
        : undefined;
    body.parallel_tool_calls =
      tools != null
        ? options.parallel_tool_calls
        : undefined;

    return body;
  }

  serializeContextForTokenEstimate(body)
  {
    const context =
    {
      messages: body.messages,
    };

    if (body.tools != null)
    {
      context.tools = body.tools;
    }

    if (body.response_format != null)
    {
      context.response_format = body.response_format;
    }

    return JSON.stringify(context);
  }

  getContextTokenSize(options = {})
  {
    const body = this.buildRequest(options);
    const serializedContext =
      this.serializeContextForTokenEstimate(body);

    return Math.ceil(
      serializedContext.length / this.averageCharsPerToken
    );
  }

  logMessages(messages)
  {
    console.debug('\n========== OPENAI MESSAGES ==========');

    for (const [index, message] of messages.entries())
    {
      const messageChars = JSON.stringify(message).length;
      const estimatedTokens = Math.ceil(messageChars / this.averageCharsPerToken);

      console.debug(`\n#${index + 1}`);
      console.debug(`role: ${message.role ?? ''} | chars: ${messageChars} | tokens: ~${estimatedTokens}`);
      console.debug(`name: ${message.name ?? ''}`);
      console.debug('content:');

      if (typeof message.content === 'string')
      {
        console.debug(message.content);
      }
      else
      {
        console.debug(JSON.stringify(message.content ?? '', null, 2));
      }

      if (Array.isArray(message.tool_calls) && message.tool_calls.length)
      {
        console.debug('tool_calls:');
        console.debug(JSON.stringify(message.tool_calls, null, 2));
      }

      if (message.tool_call_id)
      {
        console.debug(`tool_call_id: ${message.tool_call_id}`);
      }
    }
  }

  async postStreamingCompletion(body, { signal } = {})
  {
    const endpointUrl = this._buildEndpointUrl('chat/completions');
    const requestStartedAt = performance.now();
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: this._buildHeaders({ contentType: 'application/json', headers: { Accept: 'text/event-stream' } }),
      body: JSON.stringify({ ...body, stream: true, stream_options: { include_usage: true } }),
      signal,
    });

    if (!response.ok)
    {
      const payload = await this.parseResponse(response);
      this._throwRequestError({ response, payload, context: 'OpenAI chat completion request failed', endpointUrl });
    }

    const payload = { choices: [] };
    const choices = new Map();
    let firstTokenAt = null;
    let lastTokenAt = null;
    let buffer = '';
    const processEvent = (eventText) =>
    {
      const data = eventText.split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');

      if (!data || data === '[DONE]')
      {
        return;
      }

      const chunk = JSON.parse(data);

      for (const [property, value] of Object.entries(chunk))
      {
        if (!['choices', 'usage'].includes(property))
        {
          payload[property] = value;
        }
      }

      if (chunk.usage != null)
      {
        payload.usage = chunk.usage;
      }

      for (const chunkChoice of chunk.choices ?? [])
      {
        const choice = choices.get(chunkChoice.index) ?? { index: chunkChoice.index, message: { role: 'assistant', content: '' } };
        const delta = chunkChoice.delta ?? {};

        if (typeof delta.content === 'string')
        {
          choice.message.content += delta.content;
        }

        for (const property of ['reasoning_content', 'reasoning'])
        {
          if (typeof delta[property] === 'string')
          {
            choice.message[property] = `${choice.message[property] ?? ''}${delta[property]}`;
          }
        }

        for (const toolCallDelta of delta.tool_calls ?? [])
        {
          choice.message.tool_calls ??= [];
          const toolCall = choice.message.tool_calls[toolCallDelta.index] ?? { id: '', type: 'function', function: { name: '', arguments: '' } };
          toolCall.id += toolCallDelta.id ?? '';
          toolCall.type = toolCallDelta.type ?? toolCall.type;
          toolCall.function.name += toolCallDelta.function?.name ?? '';
          toolCall.function.arguments += toolCallDelta.function?.arguments ?? '';
          choice.message.tool_calls[toolCallDelta.index] = toolCall;
        }

        if (chunkChoice.finish_reason != null)
        {
          choice.finish_reason = chunkChoice.finish_reason;
        }

        choices.set(chunkChoice.index, choice);

        const hasOutput = typeof delta.content === 'string' && delta.content.length > 0
          || typeof delta.reasoning_content === 'string' && delta.reasoning_content.length > 0
          || typeof delta.reasoning === 'string' && delta.reasoning.length > 0
          || (delta.tool_calls ?? []).some((toolCall) => toolCall.function?.name || toolCall.function?.arguments);

        if (hasOutput)
        {
          const tokenReceivedAt = performance.now();
          firstTokenAt ??= tokenReceivedAt;
          lastTokenAt = tokenReceivedAt;
        }
      }
    };

    for await (const content of response.body.pipeThrough(new TextDecoderStream()))
    {
      buffer += content;
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop();

      for (const eventText of events)
      {
        processEvent(eventText);
      }
    }

    if (buffer.trim())
    {
      processEvent(buffer);
    }

    const completedAt = performance.now();
    const outputTokens = Number(payload.usage?.completion_tokens ?? payload.usage?.output_tokens ?? 0);
    const generationDurationMs = firstTokenAt === null ? null : completedAt - firstTokenAt;
    payload.choices = [...choices.values()].sort((first, second) => first.index - second.index);
    this.applyResponseCost(payload, response.headers);

    return this.applyCost({
      endpointUrl,
      payload,
      metrics: {
        streaming: true,
        durationMs: completedAt - requestStartedAt,
        timeToFirstTokenMs: firstTokenAt === null ? null : firstTokenAt - requestStartedAt,
        outputTokensPerSecond: outputTokens > 0 && generationDurationMs > 0 ? outputTokens / (generationDurationMs / 1000) : null,
      },
    }, payload);
  }

  async generate(options = {})
  {
    const body = this.buildRequest(options);

    this.logMessages(body.messages);

    const requestStartedAt = performance.now();
    const result = this.stream
      ? await this.postStreamingCompletion(body, { signal: options.signal })
      : await this.postJson('chat/completions', body, {
        errorContext: 'OpenAI chat completion request failed',
        signal: options.signal,
      });
    const { endpointUrl, payload } = result;

    let finalPayload;

    try
    {
      finalPayload = this.normalizeToolCallOutput(payload);
    }
    catch
    {
      finalPayload = payload;
    }

    const assistantText =
      OpenAIChatCompletion.extractOutputText(finalPayload);

    this.updateAverageCharsPerTokenFromUsage(body, finalPayload);

    finalPayload.assistant_text = assistantText;
    finalPayload.endpointUrl = endpointUrl;
    finalPayload.request = body;
    finalPayload.metrics = result.metrics ?? {
      streaming: false,
      durationMs: performance.now() - requestStartedAt,
      timeToFirstTokenMs: null,
      outputTokensPerSecond: null,
    };

    return finalPayload;
  }
}
