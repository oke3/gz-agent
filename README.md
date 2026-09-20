# gz-agent

> Production-grade agent runtime for AI systems — tool calling, state machines, memory, and multi-agent coordination.

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Ground Zero LLC](https://img.shields.io/badge/organization-Ground%20Zero%20LLC-blue.svg)](https://github.com/oke3)
[![npm](https://img.shields.io/badge/npm-gz--agent-red.svg)](https://www.npmjs.com/package/gz-agent)
[![CI](https://img.shields.io/badge/CI-passing-brightgreen.svg)](https://github.com/oke3/gz-agent/actions)

## Why

AI agents need more than a prompt and a response. They need:

- **Tool calling** — execute functions, read files, run commands
- **State machines** — track what the agent is doing at any moment
- **Memory** — remember conversations and persistent facts
- **Coordination** — spawn, delegate, and collect results from multiple agents

gz-agent is the **operating system** for AI agents. It handles the plumbing so you can focus on what your agent does, not how it runs.

## Quick Start

```bash
npm install gz-agent
```

```typescript
import { Agent, createDefaultRegistry } from "gz-agent";

const agent = new Agent({
  id: "my-agent",
  name: "My Agent",
  systemPrompt: "You are a helpful assistant with file system access.",
  tools: createDefaultRegistry().list(),
  model: "gpt-4o-mini",
  maxIterations: 10,
  maxTokens: 4096,
  temperature: 0.7,
  provider: {
    name: "openai",
    apiKey: process.env["OPENAI_API_KEY"] ?? "",
    baseUrl: "https://api.openai.com/v1",
  },
});

const result = await agent.run("Read the file package.json and summarize it.");
console.log(result.response);
console.log(`Tool calls: ${result.toolCalls.length}`);
console.log(`Tokens: ${result.tokens.input} in / ${result.tokens.output} out`);
```

## Architecture

```
gz-agent
├── core/
│   ├── types.ts          All types (Agent, Tool, State, Message, etc.)
│   ├── agent.ts          Agent class — state machine, tool calling, streaming
│   ├── tool.ts           Tool registry — register, validate, execute tools
│   └── memory.ts         Conversation memory — working + long-term
├── coordination/
│   ├── orchestrator.ts   Multi-agent coordinator — spawn, delegate, collect
│   └── protocol.ts       Inter-agent communication protocol
├── cli.ts                CLI entry point
└── index.ts              Barrel export
```

### The Agent Loop

```
User Message
    │
    ▼
┌─────────────┐
│   THINKING   │ ← Call LLM with messages + tool definitions
└──────┬──────┘
       │
       ▼
   ┌────────┐     YES    ┌──────────────┐
   │  Tool   │───────────▶│ TOOL_CALLING  │ ──┐
   │  Calls? │            └──────────────┘   │
   └────────┘                                │
       │ NO                                  │
       ▼                                     │
┌─────────────┐     ◀────────────────────────┘
│  RESPONDING  │ ← Execute tools, add results, loop back
└─────────────┘
```

## Features

### Tool Calling

Any function can be a tool. Define parameters, write an execute function, register it.

```typescript
import { Tool } from "gz-agent";

const weatherTool: Tool = {
  name: "get_weather",
  description: "Get current weather for a city",
  parameters: {
    city: { type: "string", description: "City name", required: true },
  },
  execute: async (args) => {
    const city = args["city"];
    // Your weather API call here
    return `Weather in ${city}: 72°F, sunny`;
  },
};

agent.getRegistry().register(weatherTool);
```

### Built-in Tools

gz-agent ships with five tools out of the box:

| Tool | Description |
|------|-------------|
| `web_search` | Stub for web search (provide your own implementation) |
| `read_file` | Read file contents from disk |
| `write_file` | Write content to a file |
| `list_directory` | List directory entries |
| `run_command` | Execute a shell command with timeout |

### Memory System

Two-tier memory for conversations:

```typescript
// Working memory — current conversation
agent.getMemory().addWorking({
  role: "user",
  content: "Remember my name is Alice",
  timestamp: Date.now(),
});

// Long-term memory — persistent facts
agent.getMemory().addFact("User's name is Alice", "conversation:turn:1");

// Search long-term memory
const facts = agent.getMemory().searchFacts("Alice");
// → ["User's name is Alice"]

// Save to disk
await agent.getMemory().save();
```

### Streaming

Stream responses token-by-token with `runStream()`:

```typescript
for await (const chunk of agent.runStream("Tell me a story")) {
  if (typeof chunk === "string") {
    process.stdout.write(chunk);
  } else if (chunk.type === "tool_call") {
    console.log(`\n[Calling ${chunk.name}...]`);
  }
}
```

### Multi-Agent Orchestration

Coordinate multiple agents for complex workflows:

```typescript
import { Orchestrator } from "gz-agent";

const orchestrator = new Orchestrator();
orchestrator.registerAgent(researchAgent);
orchestrator.registerAgent(writingAgent);

// Delegate a single task
const result = await orchestrator.delegate({
  id: "task-1",
  prompt: "Research the latest AI trends",
  agentId: "research-agent",
  status: "pending",
});

// Run tasks in parallel
const results = await orchestrator.parallel([
  { id: "t1", prompt: "Analyze market", agentId: "analyst", status: "pending" },
  { id: "t2", prompt: "Write report", agentId: "writer", status: "pending" },
]);

// Pipeline: output of one task feeds into the next
const pipeline = await orchestrator.pipeline(
  "Research the AI agent market",
  ["researcher", "analyzer", "writer"]
);

// Fan-out: same prompt to multiple agents
const perspectives = await orchestrator.fanOut(
  "What are the risks of AI?",
  ["optimist", "pessimist", "realist"]
);
```

### Inter-Agent Protocol

Agents communicate via a typed protocol:

```typescript
import { Protocol } from "gz-agent";

const protocol = new Protocol();
protocol.setTransport(async (msg) => {
  // Send message to target agent via any transport (HTTP, WebSocket, etc.)
  await fetch(`http://agent-host/${msg.to}`, {
    method: "POST",
    body: JSON.stringify(msg),
  });
  return true;
});

// Delegate work to another agent
await protocol.delegateTask("orchestrator", "researcher", task);
```

## CLI Reference

```bash
# Run an agent
gz-agent run --agent agent.json --message "Do something"

# List available tools
gz-agent tools

# Validate agent configuration
gz-agent validate --agent agent.json

# Show help
gz-agent --help
```

### Agent Config Format

```json
{
  "id": "my-agent",
  "name": "My Agent",
  "systemPrompt": "You are a helpful assistant.",
  "model": "gpt-4o-mini",
  "maxIterations": 10,
  "maxTokens": 4096,
  "temperature": 0.7,
  "provider": {
    "name": "openai",
    "apiKey": "sk-...",
    "baseUrl": "https://api.openai.com/v1"
  }
}
```

## API Reference

### `Agent`

| Method | Returns | Description |
|--------|---------|-------------|
| `run(message)` | `Promise<AgentResult>` | Run agent with a user message |
| `runStream(message)` | `AsyncGenerator` | Stream response chunks |
| `getState()` | `AgentState` | Current state: idle/thinking/tool_calling/responding/error |
| `getMessages()` | `Message[]` | Conversation history |
| `getRegistry()` | `ToolRegistry` | Tool registry for this agent |
| `getMemory()` | `Memory` | Memory system |
| `reset()` | `void` | Clear conversation and reset state |

### `ToolRegistry`

| Method | Returns | Description |
|--------|---------|-------------|
| `register(tool)` | `void` | Register a tool |
| `registerMany(tools)` | `void` | Register multiple tools |
| `get(name)` | `Tool \| undefined` | Get tool by name |
| `list()` | `Tool[]` | List all tools |
| `getDefinitions()` | `OpenAIToolDefinition[]` | Export for LLM API calls |
| `execute(name, args)` | `Promise<string>` | Execute a tool |

### `Memory`

| Method | Returns | Description |
|--------|---------|-------------|
| `getWorking()` | `Message[]` | Current conversation |
| `addWorking(msg)` | `void` | Add message to working memory |
| `clearWorking()` | `void` | Clear working memory |
| `addFact(fact, source)` | `void` | Add a long-term fact |
| `searchFacts(query)` | `string[]` | Search facts by substring |
| `save()` | `Promise<void>` | Persist to disk |
| `load()` | `Promise<void>` | Load from disk |

### `Orchestrator`

| Method | Returns | Description |
|--------|---------|-------------|
| `registerAgent(agent)` | `void` | Register an agent |
| `delegate(task)` | `Promise<AgentResult>` | Run a single task |
| `parallel(tasks)` | `Promise<AgentResult[]>` | Run tasks in parallel |
| `sequential(tasks)` | `Promise<AgentResult[]>` | Run tasks sequentially |
| `pipeline(prompt, agentIds)` | `Promise<AgentResult[]>` | Chain agent outputs |
| `fanOut(prompt, agentIds)` | `Promise<Map<string, AgentResult>>` | Same prompt, multiple agents |

### `Protocol`

| Method | Returns | Description |
|--------|---------|-------------|
| `setTransport(send)` | `void` | Set message transport |
| `on(type, handler)` | `void` | Register message handler |
| `delegateTask(from, to, task)` | `Promise<boolean>` | Send task delegation |
| `sendResult(from, to, taskId, result)` | `Promise<boolean>` | Send task result |
| `sendError(from, to, taskId, error)` | `Promise<boolean>` | Send task error |

## LLM Compatibility

gz-agent works with any **OpenAI-compatible** API endpoint:

| Provider | baseUrl |
|----------|---------|
| OpenAI | `https://api.openai.com/v1` |
| gz-gateway | `http://localhost:3000/v1` |
| Ollama | `http://localhost:11434/v1` |
| LM Studio | `http://localhost:1234/v1` |
| Together AI | `https://api.together.xyz/v1` |
| Groq | `https://api.groq.com/openai/v1` |

## Related Projects

| Project | Description |
|---------|-------------|
| [gz-context-engine](https://github.com/oke3/gz-context-engine) | Context window management and optimization |
| [gz-gateway](https://github.com/oke3/gz-gateway) | OpenAI-compatible API gateway |
| [gz-modelrouter](https://github.com/oke3/gz-modelrouter) | Smart model routing and fallback |
| [gz-sessions](https://github.com/oke3/gz-sessions) | Session management for AI agents |
| [gz-sessionrecall](https://github.com/oke3/gz-sessionrecall) | Session history recall and search |
| [gz-bench](https://github.com/oke3/gz-bench) | AI agent benchmarking suite |
| [gz-authmesh](https://github.com/oke3/gz-authmesh) | Distributed auth mesh for agents |
| [gz-remote](https://github.com/oke3/gz-remote) | Remote agent execution |
| [gz-codemap](https://github.com/oke3/gz-codemap) | Codebase map generation for agents |

## Enterprise Support

Need custom agent runtimes, dedicated infrastructure, or consulting? Ground Zero LLC provides enterprise support for AI agent systems.

**[Contact Ground Zero LLC →](mailto:hello@groundzero.llc)**

## License

MIT © 2026 [Ground Zero LLC](https://github.com/oke3)
