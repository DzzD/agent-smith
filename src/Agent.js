/**
 * This file is part of the Agent Smith project.
 * Copyright (c) 2026 Bruno Auger (DzzD).
 * Licensed under the MIT License.
 */
import { AgentUtils } from './AgentUtils.js';
import { AgentEventManager } from './AgentEventManager.js';
import { AgentControlSkill } from './AgentControlSkill.js';
import { OpenAIChatCompletion } from './net/client/openai/OpenAIChatCompletion.js';

export class Agent
{
  static GLOBAL_STREAM_ID = '__global__';

  static getModelCallMetrics(response)
  {
    const usage = response?.usage;
    const optionalNumber = (...values) =>
    {
      const value = values.find((candidate) => candidate != null);
      return value === undefined ? null : Number(value);
    };
    const promptTokens = optionalNumber(usage?.prompt_tokens, usage?.input_tokens);
    const cachedPromptTokens = optionalNumber(usage?.prompt_tokens_details?.cached_tokens, usage?.input_tokens_details?.cached_tokens);
    const outputTokens = optionalNumber(usage?.completion_tokens, usage?.output_tokens);
    const reasoningTokens = optionalNumber(usage?.completion_tokens_details?.reasoning_tokens, usage?.output_tokens_details?.reasoning_tokens);
    const message = response?.choices?.[0]?.message;
    const hasReasoningContent = [message?.reasoning_content, message?.reasoning]
      .some((value) => typeof value === 'string' ? value.trim().length > 0 : value != null)
      || (Array.isArray(message?.reasoning_details) && message.reasoning_details.length > 0);
    const cachePercent = promptTokens > 0 && cachedPromptTokens != null
      ? ((cachedPromptTokens / promptTokens) * 100).toFixed(1)
      : promptTokens === 0 && cachedPromptTokens === 0 ? '0.0' : null;

    return {
      promptTokens,
      cachedPromptTokens,
      outputTokens,
      cachePercent,
      hasReasoning: reasoningTokens > 0 || hasReasoningContent,
      reasoningTokens,
    };
  }

  constructor({
    agentUid = null,
    name = 'Agent',
    openAIUrl = null,
    openAIKey = null,
    openAIModel = null,
    openAIStream = false,
    embeddingUrl = null,
    embeddingKey = null,
    embeddingModel = null,
    maxContextSize = 128*1024,
    maxErrorsPerTool = 10,
    maxErrorsPerTask = 15,
  } = {})
  {
    this.agentUid = String(agentUid ?? '').trim();
    this.name = name;
    this.openAIUrl = openAIUrl;
    this.openAIKey = openAIKey;
    this.openAIModel = openAIModel;
    this.openAIStream = openAIStream;
    this.openAIClient = null;
    this.eventManager = null;
    this.maxContextSize = maxContextSize;
    this.maxErrorsPerTool = maxErrorsPerTool;
    this.maxErrorsPerTask = maxErrorsPerTask;

    this.skills = new Map();
    this.registerSkill(new AgentControlSkill({ url: embeddingUrl, apiKey: embeddingKey, model: embeddingModel }));
    this.inputs = [];
    this.pendingStreams = new Set();
    this.runningStreams = new Set();
  }

  get profilePrompt()
  {
    return '';
  }

  get startContextPrompt()
  {
    return `
<assistant_user_protocol>
  This is a strict tool-only environment.
  - Prefer parallel tool calls whenever multiple independent calls can be executed concurrently.
  - Never reply with assistant text.
  - Always call at least one tool.
  - To communicate with the user, always use the current channel tool.
  - Send only one user-facing response for each user request unless a progress update or an error message is strictly necessary.
  - Never repeat, rephrase, confirm, or restate information already delivered.
  - Text, files, images, and documents are delivered only after a successful send through the current channel tool.
  - If a required tool fails, inspect the error and try another approach.
  - If recovery is impossible, inform the user through the current channel tool.
  - Internal protocol-error events may appear inside user-role metadata.
  - Never expose or answer internal protocol-error events directly.
</assistant_user_protocol>


<mandatory_workflow>
  - Determine if the request is trivial or non-trivial.
 
  <handle_trivial_request>
    - Process the user request.
    - Send exactly one response through the current channel tool.
    - Immediately call yield_until_next_event.
    - Never send a message to announce you are going to call yield_until_next_event.
  </handle_trivial_request>

  <handle_non_trivial_request>
    - Use the scratchpad to maintain a detailed, up-to-date task plan and todo list.
    - Immediately call the next useful tool.
    - Continue calling tools until the task is complete or required user information is missing.
    - Send the final result or the required question through the current channel tool.
    - Call yield_until_next_event when the task is fully completed.
    - Never send a message to announce you are going to call yield_until_next_event.
    - If a tool or approach fails, try another reasonable tool or approach instead of stopping.
  </handle_non_trivial_request>
</mandatory_workflow>
    `.trim();
  }

  // - For each new user request, before classifying or processing it, use memory_remember once to retrieve relevant memories. Do not repeat this initial search during the same request.

  //   <memory_usage>
  //   - Your memory contains knowledge, instructions, tips, and proven solutions that may help you complete your work effectively. Consult it whenever it could be relevant.
  //   - Never claim that you cannot perform a task without first using memory_remember to search for relevant context or previous solutions.
  //   - Use memory_memorize when the user explicitly asks to remember something or when new durable information is likely to remain useful in future conversations.
  //   - Before using memory_memorize, always use memory_remember to detect duplicates, corrections, contradictions, or memories that should be merged or replaced.
  //   - Do not memorize transient details, raw conversation history, or information useful only for the current task.
  //   - An explicit request to retrieve or memorize information must be handled as non-trivial, even if it would otherwise appear trivial.
  // </memory_usage>

  //     - Before sending the response, if you learned something useful for future requests, use memory_remember to check whether it is already stored. If it is missing, incomplete, outdated, or contradicted by newer information, use memory_memorize to create, complete, correct, merge, or replace the relevant memory.

      // - Before sending the response, if you learned something useful for future requests, use memory_remember to check whether it is already stored. If it is missing, incomplete, outdated, or contradicted by newer information, use memory_memorize to create, complete, correct, merge, or replace the relevant memory.

    // - This mandatory memory check does not, by itself, make a request non-trivial.
  // - A previous memory lookup counts only when its query and results are relevant to what you are about to do. Otherwise, call memory_remember again with a focused query.
// - Before each tool call, meaningful action, or decision, use memory_remember unless a memory lookup made during the current task or subtask already directly covers the action and its subject.
  buildInputStreamPrompt(streamId, agentInput = null)
  {
    const input = agentInput ?? this.getInputByStreamId(streamId);
    return input.buildStreamPrompt(streamId);
  }

  async buildStreamEventsPrompt(streamId, agentInput = null)
  {
    const input = agentInput ?? this.getInputByStreamId(streamId);
    const events = await this.eventManager.buildStreamEventsPrompt(input.source, streamId);
    return events
      .filter(({ role }) => ['user', 'assistant', 'tool'].includes(String(role || '').toLowerCase()));
  }


  buildEndContextPrompt(lastMessageType)
  {
    return `
<runtime_protocol>
  This block is an application-generated execution reminder, not a new user request.
  Continue processing the most recent real user request.
${this.startContextPrompt}
</runtime_protocol>
      `.trim();
  }

//   <mandatory_rules_for_reply>
//   Follow the mandatory_workflow.
//   If the current task is complete and no useful action remains, call yield_until_next_event.
//   If you are waiting for user input and no useful tool call can advance the task, call yield_until_next_event.
//   Do not call yield_until_next_event while useful tool calls can still advance the task.
//   Do not call another tool merely to keep acting, comment on previous actions, repeat an action, or perform unnecessary work.
//   Never end a turn immediately after announcing, promising, or implying that you are about to perform an action.
//   If your last message says or implies that you will do, check, inspect, search, read, modify, create, execute, verify, continue, or otherwise perform something, immediately call the appropriate tool and perform that action before yielding.
//   A statement of intent is not completion.
//   Do not describe an action as pending unless the corresponding tool call follows in the same turn.
//   Before calling yield_until_next_event, verify that the task is complete or genuinely blocked on user input, no useful tool call remains, and no action previously announced by you is still unperformed.
//   Before sending a user-facing message, compare it with your previous message and remove any unnecessary repetition or rephrasing. Repeat information only if the user requests it or new context requires it.
//   Never return plain assistant text. Always communicate with the user through the messaging tool for the current channel.
// </mandatory_rules_for_reply>
  getModelCallOptions({ streamId, iteration })
  {
    return {
        tool_choice: 'auto',
        parallel_tool_calls: true,
        temperature: 0.5,
        top_p: 0.95,
        user_id: streamId,
        session_id: streamId,
        prompt_cache_key: streamId,
        // noCache: false,
        // cache: {"ttl": 300},
        reasoning_effort: 'none',
        extra_body: {
          "thinking": {"type": "disabled"}
        },
        allowed_openai_params: [
          // 'thinking',
          'reasoning_effort',
          // 'prompt_cache_key',
      ],
    };
  }

  async onNoToolCallError(agentInput, streamId, content)
  {
    const error = content
      ? [
          'Plain assistant text is not allowed.',
          'Send your intended response using the messaging tool for the current channel.',
          'Do not repeat the response as plain text.',
        ]
      : [
          'You must always call at least one tool.',
          'If no user-facing response or useful action is needed, call yield_until_next_event.',
          'Otherwise, use the appropriate tool, including the messaging tool for the current channel.',
        ];

    await agentInput.pushEvent({
      streamId,
      type: 'protocol_error',
      data: {
        reason: content
          ? 'assistant_text_without_tool_call'
          : 'assistant_no_tool_call',
        error: error.join('\n'),
        message: content,
      },
    });
  }

  async onMaxIterationsReached(agentInput, streamId)
  {
    await agentInput.answer(
      streamId,
      'The task became too complex to complete.'
    );

    throw new Error('Max tool-call iterations reached.');
  }

  async onMaxErrorsReached(agentInput, streamId)
  {
    const error = `The previous task was stopped after reaching the limit of ${this.maxErrorsPerTask} total tool errors.`;

    await agentInput.pushEvent({
      streamId,
      type: 'protocol_error',
      data: { reason: 'max_errors_per_task', error, message: '' },
    });

    throw new Error(error);
  }

  async onMaxToolErrorsReached(agentInput, streamId, toolName)
  {
    const error = `Tool "${toolName}" reached the limit of ${this.maxErrorsPerTool} errors during the previous task.`;

    await agentInput.pushEvent({
      streamId,
      type: 'protocol_error',
      data: { reason: 'max_errors_per_tool', error, message: '' },
    });

    throw new Error(error);
  }

  async onModelCallError(agentInput, streamId, error)
  {
    throw error;
  }

  async callControlTool(toolName, args, context)
  {
    if (toolName === 'yield_until_next_event')
    {
      return {
        ok: true,
        controlAction: 'yield',
      };
    }

    throw new Error(`Unknown control tool: ${toolName}`);
  }


  createOpenAIClient()
  {
    return new OpenAIChatCompletion({
      apiKey: this.openAIKey,
      request: { model: this.openAIModel },
      url: this.openAIUrl,
      stream: this.openAIStream,
    });
  }

  createEventManager()
  {
    return new AgentEventManager(this);
  }

  registerSkill(skill, { active = true, loadOnDemand = null } = {})
  {
    skill.agent = this;

    const resolvedLoadOnDemand = typeof loadOnDemand === 'boolean' ? loadOnDemand : active === false;
    skill.loadOnDemand = skill.name === 'LazyLoadSkill' ? false : resolvedLoadOnDemand;

    this.skills.set(skill.name, skill);

    return this;
  }

  registerInput(input)
  {
    input.agent = this;
    this.inputs.push(input);

    return this;
  }

  async start()
  {
    this.openAIClient = this.createOpenAIClient();
    this.eventManager = this.createEventManager();

    await this.eventManager.load();

    for (const skill of this.skills.values())
    {
      if (this.isSkillLoadOnDemand(skill))
      {
        continue;
      }

      await skill.load({ streamId: Agent.GLOBAL_STREAM_ID });
    }

    for (const input of this.inputs)
    {
      await input.start();
    }
  }

  onInput(input)
  {
    input.agentInput.addStream(input.streamId);
    const streamKey = this.getStreamKey(input.agentInput, input.streamId);
    this.pendingStreams.add(streamKey);

    this.processPendingStream(input.agentInput, input.streamId).catch((error) =>
    {
      console.error(`[Agent] Stream processing error [${input.streamId}]:`, error);
    });
  }

  async processPendingStream(agentInput, streamId)
  {
    const streamKey = this.getStreamKey(agentInput, streamId);

    if (this.runningStreams.has(streamKey))
    {
      return;
    }

    this.runningStreams.add(streamKey);

    try
    {
      while (true)
      {
        if (!this.pendingStreams.has(streamKey))
        {
          return;
        }

        this.pendingStreams.delete(streamKey);

        try
        {
          await agentInput.startTask(streamId);
          await this.runTask({ agentInput, streamId });
        }
        catch (error)
        {
          console.error(`[Agent] Task error [${streamId}]:`, error);
        }
        finally
        {
          try
          {
            await agentInput.endTask(streamId);
          }
          catch (error)
          {
            console.error(`[Agent] endTask error [${streamId}]:`, error);
          }
        }
      }
    }
    finally
    {
      this.runningStreams.delete(streamKey);
    }
  }

  async runTask({ agentInput, streamId })
  {
    const streamKey = this.getStreamKey(agentInput, streamId);
    let previousContextSignature = null;

    const maxIterations = 150;

    const taskState = {
      errorCountsByTool: new Map(),
      totalErrorCount: 0,
      stop: false,
      stopReason: null,
      stopToolName: null,
    };

    for (let iteration = 0; iteration < maxIterations; iteration++)
    {
      const iterationNumber = iteration + 1;
      console.log('');
      console.log(`[Agent] iteration: ${iterationNumber}`);

      this.pendingStreams.delete(streamKey);
      let context = await this.getContext(streamId, null, agentInput);
      let tools = this.buildModelTools(context.loadedSkillNames, streamId);
      taskState.loadedSkillNames = context.loadedSkillNames;

      let options = {
        instructions: context.systemPrompt,
        input: context.userPrompt,
        tools,
        ...this.getModelCallOptions({
          streamId,
          iteration: iterationNumber,
        }),
      };

      

      const maxContextSize = this.maxContextSize;
      const averageCharsPerToken = this.openAIClient.averageCharsPerToken;
      const compressionThreshold = Math.floor(maxContextSize * 0.95);
      const targetSize = Math.floor(maxContextSize * 0.85);
      const contextSize = this.openAIClient.getContextTokenSize(options);
      console.log(`[Agent] contextSizeBeforeCall: ${contextSize}`);
      if (contextSize > compressionThreshold)
      {
        const targetContextChars = Math.ceil(targetSize * averageCharsPerToken);
        await this.eventManager.compressStream(agentInput.source, streamId, targetContextChars);

        context = await this.getContext(streamId, null, agentInput);
        tools = this.buildModelTools(context.loadedSkillNames, streamId);
        taskState.loadedSkillNames = context.loadedSkillNames;

        options.instructions = context.systemPrompt;
        options.input = context.userPrompt;
        options.tools = tools;
      }

      const contextSignature = AgentUtils.stableStringify(context);

      if (contextSignature === previousContextSignature)
      {
        throw new Error('Context did not change between iterations.');
      }

      if (!Array.isArray(options.input))
      {
        options.input = [];
      }

      const lastMessageType = String(options.input.at(-1)?.role || '').toLowerCase();
      options.input.push({
        role: 'user',
        content: AgentUtils.indentXmlPrompt(this.buildEndContextPrompt(lastMessageType)),
      });

      const thinkingTaskUid = `thinking-${iterationNumber}`;
      await agentInput.startSubTask(streamId, '🤔 thinking ... ', thinkingTaskUid);
      let response;
      let modelError = null;
      const llmCallStartedAt = Date.now();
      try
      {
        
        response = await this.openAIClient.generate(options);
        
      }
      catch (error)
      {
        modelError = error;
      }
      const llmDurationMs = Date.now() - llmCallStartedAt;
      const thinkingStatus = modelError ? 'failed' : 'success';
      const rawModelCost = modelError ? null : response?.cost;
      const numericModelCost = Number(rawModelCost);
      const modelCost = rawModelCost != null && Number.isFinite(numericModelCost) && numericModelCost >= 0 ? numericModelCost : null;

      try
      {
        await agentInput.endSubTask(streamId, thinkingTaskUid, thinkingStatus, modelCost);
      }
      catch (endSubTaskError)
      {
        console.error(`[Agent] endSubTask error [${streamId}] [${thinkingTaskUid}] [${thinkingStatus}]:`, endSubTaskError);
      }

      if (modelError)
      {
        await this.onModelCallError(agentInput, streamId, modelError);
        continue;
      }

      previousContextSignature = contextSignature;

      

      const { promptTokens, cachedPromptTokens, outputTokens, cachePercent, hasReasoning, reasoningTokens } = Agent.getModelCallMetrics(response);
      const timeToFirstToken = Number.isFinite(response.metrics?.timeToFirstTokenMs)
        ? `${response.metrics.timeToFirstTokenMs.toFixed(0)}ms`
        : 'n/a';
      const outputSpeed = Number.isFinite(response.metrics?.outputTokensPerSecond)
        ? `${response.metrics.outputTokensPerSecond.toFixed(2)} tokens/s`
        : 'n/a';
      const promptCache = cachePercent == null ? 'n/a' : `${cachePercent}%`;

      console.log(`[Agent] duration: ${llmDurationMs}ms | TTFT: ${timeToFirstToken} | outputSpeed: ${outputSpeed} | outputTokens: ${outputTokens ?? 'n/a'} | promptCache: ${promptCache} | reasoning: ${hasReasoning ? 'yes' : 'no'} | reasoningSize: ${reasoningTokens ?? 'n/a'} tokens`);
      console.log(`[Agent] promptSize: ${promptTokens ?? 'n/a'}`);
      console.log(`[Agent] promptCached: ${cachedPromptTokens ?? 'n/a'}`);
      console.log(`[Agent] avgCharsPerToken: ${this.openAIClient.averageCharsPerToken.toFixed(2)}`);
      console.log(`[Agent] compressionThreshold: ${compressionThreshold}`);
      console.log(`[Agent] targetSize: ${targetSize}`);

      const toolCalls = this.getToolCalls(response);

      const text = typeof response?.assistant_text === 'string' ? response.assistant_text : '';

      if (toolCalls.length === 0)
      {
        const content = text.trim();

        await this.onNoToolCallError(
          agentInput,
          streamId,
          content
        );

        continue;
      }

      const results = await this.executeToolCalls(agentInput, streamId, toolCalls, taskState);
      // console.dir(results);

      if (taskState.stop)
      {
        if (taskState.stopReason === 'max_errors_per_tool')
        {
          const toolName = taskState.stopToolName;

          await this.onMaxToolErrorsReached(
            agentInput,
            streamId,
            toolName
          );

          taskState.errorCountsByTool.delete(toolName);
        }
        else
        {
          await this.onMaxErrorsReached(agentInput, streamId);

          taskState.errorCountsByTool.clear();
          taskState.totalErrorCount = 0;
        }

        taskState.stop = false;
        taskState.stopReason = null;
        taskState.stopToolName = null;

        continue;
      }

      const yielded = results.some(({ result }) => result?.controlAction === 'yield');

      if (yielded)
      {
        return;
      }
    }

    await this.onMaxIterationsReached(agentInput, streamId);
  }

  async executeToolCalls(agentInput, streamId, toolCalls, taskState)
  {
    const results = [];

    if (toolCalls.length)
    {
      const toolCallEvents = [];

      for (const toolCall of toolCalls)
      {
        const toolName = String(toolCall.name || '').split('.').at(-1);
        let argumentsForEvent = this.parseToolArgumentsForEvent(toolCall.arguments);
        const skill = this.findSkillByToolName(toolName, taskState.loadedSkillNames, streamId);

        if (skill && skill.processToolData(toolName) !== false)
        {
          argumentsForEvent = await skill._parseToolValue(argumentsForEvent, toolCall.call_id, [], streamId, 'arguments', { agentInput });
        }

        toolCallEvents.push({
          call_id: toolCall.call_id,
          name: toolCall.name,
          arguments: argumentsForEvent,
        });
      }

      await agentInput.pushEvent({
        type: 'tool_call',
        streamId,
        senderId: 'assistant',
        senderName: this.name,
        dataType: 'json',
        data: toolCallEvents,
        prompt: '',
      });
    }

    const toolResults = await Promise.all(
      toolCalls.map(async (toolCall, index) =>
      {
        const toolName = String(toolCall.name || '').split('.').at(-1);
        const toolTaskUid = String(toolCall.call_id ?? '').trim() || `tool-${Date.now()}-${index}`;
        const argsForEvent = this.parseToolArgumentsForEvent(toolCall.arguments);
        const toolActionLabel = this.getHumanReadableToolAction(
          toolName,
          argsForEvent,
          taskState.loadedSkillNames,
          streamId
        );
        const toolStartTime = Date.now();

        let args = argsForEvent;
        let result;
        let durationMs = 0;
        let cost = null;

        if (toolActionLabel)
        {
          await agentInput.startSubTask(streamId, toolActionLabel, toolTaskUid);
        }

        console.log(`[Agent] Tool call [${toolCall.call_id}] ${toolCall.name} params:`, argsForEvent);

        try
        {
          args = this.parseToolArguments(toolCall.arguments);

          const skill = this.findSkillByToolName(
            toolName,
            taskState.loadedSkillNames,
            streamId
          );

          if (!skill)
          {
            throw new Error(`Unknown tool: ${toolCall.name}`);
          }

          result = await skill.execute(toolName, args, { agentInput, streamId, callId: toolCall.call_id });

          const rawCost = result?.cost ?? result?.response?.cost;
          const resultCost = Number(rawCost);

          if (rawCost != null && Number.isFinite(resultCost) && resultCost >= 0)
          {
            cost = resultCost;
          }
        }
        catch (error)
        {
          console.error(`[Agent] Skill error in ${toolCall.name}:`, error);
          console.error(`[Agent] Tool parameters raw [${toolCall.name}]:`, toolCall.arguments);
          console.error(`[Agent] Tool parameters parsedForEvent [${toolCall.name}]:`, argsForEvent);
          console.error(`[Agent] Tool parameters parsed [${toolCall.name}]:`, args);

          const message = error instanceof Error ? error.message : String(error);

          result = {
            ok: false,
            error: {
              type: 'tool_execution_error',
              message: message.length > 2000 ? `${message.slice(0, 2000)}...` : message,
            },
          };
        }
        finally
        {
          durationMs = Date.now() - toolStartTime;
        }

        const failed = result?.ok === false || result?.error;
        await agentInput.endSubTask(streamId, toolTaskUid, failed ? 'failed' : 'success', cost);
        console.log(`[Agent] Tool result [${toolCall.call_id}] ${toolCall.name}:`, result);

        return { toolCall, toolName, args, result, durationMs, cost };
      })
    );

    for (const toolResult of toolResults)
    {
      const { toolCall, toolName, result, durationMs, cost } = toolResult;

      let eventResult = result;
      const skill = this.findSkillByToolName(toolName, taskState.loadedSkillNames, streamId);

      if (skill && skill.processToolData(toolName) !== false)
      {
        eventResult = await skill._parseToolValue(result, toolCall.call_id, [], streamId, 'results', { agentInput });
      }

      await agentInput.pushEvent({
        type: 'tool_result',
        streamId,
        senderId: 'assistant',
        senderName: this.name,
        dataType: 'json',
        data: {
          call_id: toolCall.call_id,
          name: toolCall.name,
          result: eventResult,
          durationMs,
          ...(cost != null ? { cost } : {}),
        },
        prompt: '',
      });

      const failed = result?.ok === false || result?.error;

      if (failed)
      {
        const toolErrorCount = (taskState.errorCountsByTool.get(toolName) ?? 0) + 1;
        taskState.errorCountsByTool.set(toolName, toolErrorCount);
        taskState.totalErrorCount++;

        if (!taskState.stop && toolErrorCount >= this.maxErrorsPerTool)
        {
          taskState.stop = true;
          taskState.stopReason = 'max_errors_per_tool';
          taskState.stopToolName = toolName;
        }

        if (!taskState.stop && taskState.totalErrorCount >= this.maxErrorsPerTask)
        {
          taskState.stop = true;
          taskState.stopReason = 'max_errors_per_task';
          taskState.stopToolName = toolName;
        }

        continue;
      }

      taskState.errorCountsByTool.delete(toolName);
    }

    results.push(...toolResults);

    return results;
  }

  async getContext(streamId, streamEventsPrompt = null, agentInput = null)
  {
    for (const skill of this.skills.values())
    {
      if (!this.isSkillLoadOnDemand(skill) && !skill.isInitialized(streamId))
      {
        await skill.load({ streamId, agentInput });
      }
    }

    const resolvedStreamEventsPrompt = streamEventsPrompt ?? await this.buildStreamEventsPrompt(streamId, agentInput);

    const loadedSkillNames = this.getLoadedSkillNames({
      streamId,
      conversationMessages: resolvedStreamEventsPrompt,
    });

    const systemPrompt = [
      AgentUtils.indentXmlPrompt(this.profilePrompt?.trim()).trim(),
      AgentUtils.indentXmlPrompt(this.startContextPrompt).trim(),
      AgentUtils.indentXmlPrompt(this.buildSkillsPrompt(streamId)?.trim()),
      this.buildInputStreamPrompt(streamId, agentInput)?.trim(),
    ]
      .filter(Boolean)
      .join('\n\n');

    return {
      systemPrompt,
      userPrompt: resolvedStreamEventsPrompt,
      loadedSkillNames,
    };
  }

  buildSkillsPrompt(streamId = undefined)
  {
    const skills = [...this.skills.values()];

    if (!skills.length)
    {
      return '';
    }

    const entries = skills
      .map((skill) => skill.buildSkillNode?.({
        loadOnDemand: this.isSkillLoadOnDemand(skill),
        streamId,
      }))
      .filter((entry) => Boolean(entry?.trim()));

    if (!entries.length)
    {
      return '';
    }

    return ['<skills>', ...entries, '</skills>'].join('\n');
  }

  buildModelTools(loadedSkillNames = new Set(), streamId = undefined)
  {
    const loaded = loadedSkillNames instanceof Set ? loadedSkillNames : new Set(loadedSkillNames ?? []);

    const rawTools = [
      ...[...this.skills.values()]
        .filter((skill) => this.isSkillToolsEnabled(skill, loaded, streamId))
        .flatMap((skill) =>
        {
          return skill.getTools(streamId);
        }),
    ];

    return rawTools
      .filter(Boolean)
      .map((tool) =>
      {
        const parameters = tool.parameters;

        if (!Array.isArray(parameters?.required))
        {
          throw new Error(`Invalid tool schema for "${tool.name}": parameters.required must be an array.`);
        }

        const properties = parameters.properties;
        const required = parameters.required;
        const propertyNames = Object.keys(properties);
        const allPropertiesRequired = propertyNames.every((propertyName) => required.includes(propertyName));

        return {
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters,
            strict: allPropertiesRequired,
            ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
          },
        };
      });
  }

  getLoadedSkillNames({ streamId, conversationMessages = [] } = {})
  {
    const messages = Array.isArray(conversationMessages) ? conversationMessages : [];

    const loadSkillCallIds = new Set();
    const loadedSkillNames = new Set();

    for (const message of messages)
    {
      if (String(message?.role || '').toLowerCase() === 'assistant')
      {
        for (const toolCall of message.tool_calls ?? [])
        {
          const toolName = String(toolCall?.function?.name ?? toolCall?.name ?? '').split('.').at(-1);

          if (toolName === 'load_skill' && toolCall?.id)
          {
            loadSkillCallIds.add(String(toolCall.id));
          }
        }

        continue;
      }

      if (String(message?.role || '').toLowerCase() !== 'tool')
      {
        continue;
      }

      const callId = String(message?.tool_call_id || '').trim();

      if (!callId || !loadSkillCallIds.has(callId))
      {
        continue;
      }

      let payload = message.content;

      if (typeof payload === 'string')
      {
        try
        {
          payload = JSON.parse(payload);
        }
        catch
        {
          payload = null;
        }
      }

      const skillName = typeof payload?.skillName === 'string' ? payload.skillName.trim() : '';

      if (!skillName || !this.skills.has(skillName))
      {
        continue;
      }

      loadedSkillNames.add(skillName);
    }

    return loadedSkillNames;
  }

  findSkillByToolName(toolName, loadedSkillNames = new Set(), streamId = undefined)
  {
    for (const skill of this.skills.values())
    {
      if (!this.isSkillToolsEnabled(skill, loadedSkillNames, streamId))
      {
        continue;
      }

      const tools = skill.getTools(streamId);

      const match = tools.find((tool) => tool?.name === toolName);

      if (match)
      {
        return skill;
      }
    }

    return null;
  }

  getHumanReadableToolAction(toolName, args = {}, loadedSkillNames = new Set(), streamId = undefined)
  {
    const skill = this.findSkillByToolName(toolName, loadedSkillNames, streamId);
    return skill
      ? skill.getHumanReadableToolAction(toolName, args)
      : toolName.replaceAll('_', ' ');
  }

  getInputByStreamId(streamId)
  {
    return this.inputs.find((input) => input.hasStream(streamId)) ?? null;
  }

  getStreamKey(agentInput, streamId)
  {
    return `${agentInput.source}\u0000${streamId}`;
  }

  getInputBySource(source)
  {
    return this.inputs.find((input) => input.source === source) ?? null;
  }

  isSkillLoadOnDemand(skill)
  {
    return skill?.loadOnDemand === true;
  }

  isSkillToolsEnabled(skill, loadedSkillNames = new Set(), streamId = undefined)
  {
    const tools = skill?.getTools?.(streamId);

    if (!Array.isArray(tools) || tools.length === 0)
    {
      return false;
    }

    return skill.isLoaded(loadedSkillNames, streamId);
  }

  getToolCalls(response)
  {
    const toolCalls = response.choices?.[0]?.message?.tool_calls;

    if (!Array.isArray(toolCalls))
    {
      return [];
    }

    return toolCalls
      .map((toolCall) => ({
        call_id: toolCall.id,
        name: toolCall.function?.name,
        arguments: toolCall.function?.arguments,
        raw: toolCall,
      }))
      .filter((toolCall) => toolCall.name);
  }

  parseToolArguments(args)
  {
    if (args == null)
    {
      return {};
    }

    return typeof args === 'string' ? JSON.parse(args) : args;
  }

  parseToolArgumentsForEvent(args)
  {
    try
    {
      return this.parseToolArguments(args);
    }
    catch (error)
    {
      return {
        _raw_arguments: typeof args === 'string' ? args : AgentUtils.stringifyForPrompt(args),
        _parse_error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
