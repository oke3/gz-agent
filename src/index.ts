/**
 * gz-agent — barrel export
 *
 * Re-export all public APIs from the agent runtime.
 */

// Core types
export type {
  Tool,
  ToolParameter,
  OpenAIToolDefinition,
  AgentState,
  ProviderConfig,
  AgentConfig,
  Message,
  MessageRole,
  ToolCall,
  LLMResponse,
  ToolCallRecord,
  TokenUsage,
  AgentResult,
  TaskStatus,
  AgentTask,
  StreamChunk,
  MemoryFact,
} from "./core/types.js";

// Tool registry
export {
  ToolRegistry,
  createDefaultRegistry,
  BUILTIN_TOOLS,
  webSearchTool,
  readFileTool,
  writeFileTool,
  listDirectoryTool,
  runCommandTool,
} from "./core/tool.js";

// Memory
export { Memory, WorkingMemory, LongTermMemory } from "./core/memory.js";

// Agent
export { Agent } from "./core/agent.js";

// Coordination
export { Orchestrator } from "./coordination/orchestrator.js";
export {
  Protocol,
  type ProtocolMessage,
  type ProtocolMessageType,
  type DelegatePayload,
  type ResultPayload,
  type ErrorPayload,
  type TransportSend,
  type MessageHandler,
} from "./coordination/protocol.js";
