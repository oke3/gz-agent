/**
 * gz-agent Agent
 *
 * The core agent loop: state machine, tool calling, LLM integration,
 * and streaming support. Works with any OpenAI-compatible API endpoint.
 */

import type {
  AgentConfig,
  AgentResult,
  AgentState,
  LLMResponse,
  Message,
  ToolCall,
  ToolCallRecord,
  StreamChunk,
} from "./types.js";
import { ToolRegistry } from "./tool.js";
import { Memory } from "./memory.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timestamp(): number {
  return Date.now();
}

function userMessage(content: string): Message {
  return { role: "user", content, timestamp: timestamp() };
}

function assistantMessage(content: string): Message {
  return { role: "assistant", content, timestamp: timestamp() };
}

function systemMessage(content: string): Message {
  return { role: "system", content, timestamp: timestamp() };
}

function toolMessage(
  content: string,
  toolCallId: string,
  toolName: string
): Message {
  return {
    role: "tool",
    content,
    toolCallId,
    toolName,
    timestamp: timestamp(),
  };
}

// ─── Agent ───────────────────────────────────────────────────────────────────

/**
 * The core Agent class.
 *
 * Runs an iterative loop:
 *   1. Send messages to LLM
 *   2. If LLM returns tool calls → execute tools → go to 1
 *   3. If LLM returns text → return response
 *   4. Safety valve: max iterations
 */
export class Agent {
  private config: AgentConfig;
  private state: AgentState = "idle";
  private messages: Message[] = [];
  private registry: ToolRegistry;
  private memory: Memory;

  constructor(config: AgentConfig) {
    this.config = {
      ...config,
      maxIterations: config.maxIterations ?? 10,
      maxTokens: config.maxTokens ?? 4096,
      temperature: config.temperature ?? 0.7,
    };
    this.registry = new ToolRegistry();
    this.registry.registerMany(this.config.tools);
    this.memory = new Memory();
  }

  // ── Public API ──

  /**
   * Run the agent with a user message. Returns the full result.
   */
  async run(userMessageStr: string): Promise<AgentResult> {
    const startTime = Date.now();
    const allMessages: Message[] = [];
    const allToolCalls: ToolCallRecord[] = [];
    let iterations = 0;
    let totalTokens = { input: 0, output: 0 };

    // Initialize conversation with system prompt
    this.messages = [systemMessage(this.config.systemPrompt)];
    this.state = "idle";

    // Add user message
    const userMsg = userMessage(userMessageStr);
    this.messages.push(userMsg);
    allMessages.push(userMsg);

    try {
      while (iterations < this.config.maxIterations) {
        iterations++;
        this.state = "thinking";

        // Call LLM
        const response = await this.callLLM();
        totalTokens.input += response.usage.promptTokens;
        totalTokens.output += response.usage.completionTokens;

        // If no tool calls, we're done
        if (response.toolCalls.length === 0) {
          this.state = "responding";
          const content = response.content ?? "";
          const msg = assistantMessage(content);
          this.messages.push(msg);
          allMessages.push(msg);

          // Store interesting facts in long-term memory
          if (content.length > 50) {
            this.memory.addFact(
              content.slice(0, 200),
              `agent:${this.config.id}:turn:${iterations}`
            );
          }

          return {
            response: content,
            messages: allMessages,
            toolCalls: allToolCalls,
            state: "responding",
            iterations,
            tokens: totalTokens,
            latencyMs: Date.now() - startTime,
          };
        }

        // Execute tool calls
        this.state = "tool_calling";

        // Add assistant message with tool calls
        const toolCallSummary = response.toolCalls
          .map((tc) => `[Tool call: ${tc.name}(${JSON.stringify(tc.arguments)})]`)
          .join("\n");
        const assistantMsg = assistantMessage(
          response.content
            ? `${response.content}\n${toolCallSummary}`
            : toolCallSummary
        );
        this.messages.push(assistantMsg);
        allMessages.push(assistantMsg);

        // Execute each tool call and collect results
        for (const toolCall of response.toolCalls) {
          let result: string;
          try {
            result = await this.registry.execute(
              toolCall.name,
              toolCall.arguments
            );
          } catch (err) {
            result = `Error executing tool "${toolCall.name}": ${
              err instanceof Error ? err.message : String(err)
            }`;
          }

          const toolMsg = toolMessage(result, toolCall.id, toolCall.name);
          this.messages.push(toolMsg);
          allMessages.push(toolMsg);

          allToolCalls.push({
            name: toolCall.name,
            args: toolCall.arguments,
            result,
          });
        }
      }

      // Max iterations reached
      this.state = "responding";
      const warning = `Agent reached maximum iterations (${this.config.maxIterations}). Partial result returned.`;
      return {
        response: warning,
        messages: allMessages,
        toolCalls: allToolCalls,
        state: "responding",
        iterations,
        tokens: totalTokens,
        latencyMs: Date.now() - startTime,
      };
    } catch (err) {
      this.state = "error";
      const errorMsg = `Agent error: ${
        err instanceof Error ? err.message : String(err)
      }`;
      return {
        response: errorMsg,
        messages: allMessages,
        toolCalls: allToolCalls,
        state: "error",
        iterations,
        tokens: totalTokens,
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Run the agent with streaming. Yields content chunks and tool call events.
   */
  async *runStream(
    userMessageStr: string
  ): AsyncGenerator<
    string | { type: "tool_call"; name: string; args: Record<string, unknown> }
  > {
    this.messages = [systemMessage(this.config.systemPrompt)];
    this.state = "idle";

    const userMsg = userMessage(userMessageStr);
    this.messages.push(userMsg);

    let iterations = 0;

    while (iterations < this.config.maxIterations) {
      iterations++;
      this.state = "thinking";

      const stream = this.streamLLM();
      let fullContent = "";
      const toolCalls: ToolCall[] = [];

      for await (const chunk of stream) {
        if (chunk.content) {
          fullContent += chunk.content;
          yield chunk.content;
        }

        if (chunk.toolCalls) {
          for (const tc of chunk.toolCalls) {
            const existing = toolCalls.find((t) => t.id === tc.id);
            if (existing) {
              if (tc.arguments) {
                existing.arguments = {
                  ...existing.arguments,
                  ...tc.arguments,
                };
              }
            } else if (tc.id && tc.name) {
              toolCalls.push({
                id: tc.id,
                name: tc.name,
                arguments: (tc.arguments as Record<string, unknown>) ?? {},
              });
            }
          }
        }
      }

      // If no tool calls, done
      if (toolCalls.length === 0) {
        this.state = "responding";
        const msg = assistantMessage(fullContent);
        this.messages.push(msg);
        return;
      }

      // Execute tools
      this.state = "tool_calling";
      if (fullContent) {
        this.messages.push(assistantMessage(fullContent));
      }

      for (const tc of toolCalls) {
        yield { type: "tool_call", name: tc.name, args: tc.arguments };

        let result: string;
        try {
          result = await this.registry.execute(tc.name, tc.arguments);
        } catch (err) {
          result = `Error: ${err instanceof Error ? err.message : String(err)}`;
        }

        this.messages.push(toolMessage(result, tc.id, tc.name));
      }
    }

    this.state = "responding";
  }

  /** Get current agent state. */
  getState(): AgentState {
    return this.state;
  }

  /** Get conversation messages. */
  getMessages(): Message[] {
    return [...this.messages];
  }

  /** Get the tool registry. */
  getRegistry(): ToolRegistry {
    return this.registry;
  }

  /** Get the memory instance. */
  getMemory(): Memory {
    return this.memory;
  }

  /** Reset agent state and conversation. */
  reset(): void {
    this.state = "idle";
    this.messages = [];
  }

  /** Get agent config (read-only). */
  getConfig(): Readonly<AgentConfig> {
    return this.config;
  }

  // ── LLM Integration ──

  /**
   * Call the LLM with the current message history.
   * Supports any OpenAI-compatible API endpoint.
   */
  private async callLLM(): Promise<LLMResponse> {
    const { provider, model, maxTokens, temperature } = this.config;
    const toolDefs = this.registry.getDefinitions();

    const body: Record<string, unknown> = {
      model,
      messages: this.messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.toolCallId
          ? { tool_call_id: m.toolCallId, name: m.toolName }
          : {}),
      })),
      max_tokens: maxTokens,
      temperature,
    };

    if (toolDefs.length > 0) {
      body["tools"] = toolDefs;
    }

    const url = `${provider.baseUrl.replace(/\/+$/, "")}/chat/completions`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LLM API error ${response.status}: ${text}`);
    }

    const data = (await response.json()) as {
      choices: Array<{
        message: {
          content?: string;
          tool_calls?: Array<{
            id: string;
            function: { name: string; arguments: string };
          }>;
        };
        finish_reason: string;
      }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const choice = data.choices[0];
    if (!choice) throw new Error("LLM returned no choices");

    const msg = choice.message;
    const toolCalls: ToolCall[] = (msg.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
    }));

    return {
      content: msg.content ?? null,
      toolCalls,
      finishReason: choice.finish_reason,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }

  /**
   * Stream from the LLM. Yields parsed SSE chunks.
   */
  private async *streamLLM(): AsyncGenerator<StreamChunk> {
    const { provider, model, maxTokens, temperature } = this.config;
    const toolDefs = this.registry.getDefinitions();

    const body: Record<string, unknown> = {
      model,
      messages: this.messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.toolCallId
          ? { tool_call_id: m.toolCallId, name: m.toolName }
          : {}),
      })),
      max_tokens: maxTokens,
      temperature,
      stream: true,
    };

    if (toolDefs.length > 0) {
      body["tools"] = toolDefs;
    }

    const url = `${provider.baseUrl.replace(/\/+$/, "")}/chat/completions`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LLM stream error ${response.status}: ${text}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body for streaming");

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") return;

          try {
            const parsed = JSON.parse(data) as {
              choices: Array<{
                delta: {
                  content?: string;
                  tool_calls?: Array<{
                    index: number;
                    id?: string;
                    function?: { name?: string; arguments?: string };
                  }>;
                };
                finish_reason?: string;
              }>;
              usage?: { prompt_tokens: number; completion_tokens: number };
            };

            const choice = parsed.choices[0];
            if (!choice) continue;

            const delta = choice.delta;
            const chunk: StreamChunk = {};

            if (delta.content) chunk.content = delta.content;
            if (choice.finish_reason)
              chunk.finishReason = choice.finish_reason;
            if (parsed.usage) {
              chunk.usage = {
                promptTokens: parsed.usage.prompt_tokens,
                completionTokens: parsed.usage.completion_tokens,
              };
            }

            if (delta.tool_calls) {
              chunk.toolCalls = delta.tool_calls.map((tc) => ({
                id: tc.id,
                name: tc.function?.name,
                arguments: tc.function?.arguments
                  ? (JSON.parse(tc.function.arguments) as Record<
                      string,
                      unknown
                    >)
                  : undefined,
              }));
            }

            yield chunk;
          } catch {
            // Skip unparseable SSE lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
