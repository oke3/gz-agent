/**
 * gz-agent core types
 *
 * All shared types for the agent runtime: tools, agents, messages,
 * state machines, multi-agent coordination, and results.
 */

// ─── Tool ────────────────────────────────────────────────────────────────────

/** A single tool parameter definition. */
export interface ToolParameter {
  type: string;
  description: string;
  required?: boolean;
  enum?: string[];
}

/** A tool that an agent can invoke. */
export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

/** OpenAI function-calling format for a tool definition. */
export interface OpenAIToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<
        string,
        {
          type: string;
          description: string;
          enum?: string[];
        }
      >;
      required: string[];
    };
  };
}

// ─── Agent ───────────────────────────────────────────────────────────────────

/** Agent state machine states. */
export type AgentState =
  | "idle"
  | "thinking"
  | "tool_calling"
  | "responding"
  | "error";

/** Provider configuration for LLM access. */
export interface ProviderConfig {
  name: string;
  apiKey: string;
  baseUrl: string;
}

/** Full agent configuration. */
export interface AgentConfig {
  id: string;
  name: string;
  systemPrompt: string;
  tools: Tool[];
  model: string;
  maxIterations: number;
  maxTokens: number;
  temperature: number;
  provider: ProviderConfig;
}

// ─── Messages ────────────────────────────────────────────────────────────────

/** Roles in a conversation. */
export type MessageRole = "system" | "user" | "assistant" | "tool";

/** A single message in a conversation. */
export interface Message {
  role: MessageRole;
  content: string;
  toolCallId?: string;
  toolName?: string;
  timestamp: number;
}

/** A tool call returned by the LLM. */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Parsed response from the LLM. */
export interface LLMResponse {
  content: string | null;
  toolCalls: ToolCall[];
  finishReason: string | null;
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
}

// ─── Agent Result ────────────────────────────────────────────────────────────

/** A single tool call made during a run. */
export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  result: string;
}

/** Token usage summary. */
export interface TokenUsage {
  input: number;
  output: number;
}

/** The result of an agent run. */
export interface AgentResult {
  response: string;
  messages: Message[];
  toolCalls: ToolCallRecord[];
  state: AgentState;
  iterations: number;
  tokens: TokenUsage;
  latencyMs: number;
}

// ─── Multi-Agent ─────────────────────────────────────────────────────────────

/** Task statuses for multi-agent coordination. */
export type TaskStatus = "pending" | "running" | "completed" | "failed";

/** A task to be delegated to an agent. */
export interface AgentTask {
  id: string;
  prompt: string;
  agentId: string;
  status: TaskStatus;
  result?: AgentResult;
  parentId?: string;
}

// ─── Streaming ───────────────────────────────────────────────────────────────

/** A streaming chunk from the LLM. */
export interface StreamChunk {
  content?: string;
  toolCalls?: Partial<ToolCall>[];
  finishReason?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

// ─── Memory ──────────────────────────────────────────────────────────────────

/** A persistent fact stored in long-term memory. */
export interface MemoryFact {
  fact: string;
  source: string;
  timestamp: number;
}
