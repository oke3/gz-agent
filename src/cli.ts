#!/usr/bin/env node

/**
 * gz-agent CLI
 *
 * Command-line interface for the gz-agent runtime.
 *
 * Usage:
 *   gz-agent run --agent <config.json> --message "Do something"
 *   gz-agent tools
 *   gz-agent validate --agent <config.json>
 */

import { readFile } from "node:fs/promises";
import { Agent } from "./core/agent.js";
import { createDefaultRegistry } from "./core/tool.js";
import type { AgentConfig } from "./core/types.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function printUsage(): void {
  console.log(`
gz-agent — AI Agent Runtime

Usage:
  gz-agent run --agent <config.json> --message "Your prompt"
  gz-agent tools [--agent <config.json>]
  gz-agent validate --agent <config.json>
  gz-agent --help

Commands:
  run       Run an agent with a message
  tools     List available tools
  validate  Validate an agent configuration file

Options:
  --agent     Path to agent config JSON file
  --message   The user message/prompt
  --help      Show this help message
  --version   Show version
`);
}

function printVersion(): void {
  console.log("gz-agent v0.1.0");
}

async function loadAgentConfig(
  configPath: string
): Promise<AgentConfig> {
  const content = await readFile(configPath, "utf-8");
  const raw = JSON.parse(content) as Record<string, unknown>;

  // Merge with defaults
  const config: AgentConfig = {
    id: (raw["id"] as string) ?? "agent-0",
    name: (raw["name"] as string) ?? "Unnamed Agent",
    systemPrompt: (raw["systemPrompt"] as string) ?? "You are a helpful assistant.",
    tools: [],
    model: (raw["model"] as string) ?? "gpt-4o-mini",
    maxIterations: (raw["maxIterations"] as number) ?? 10,
    maxTokens: (raw["maxTokens"] as number) ?? 4096,
    temperature: (raw["temperature"] as number) ?? 0.7,
    provider: {
      name: (raw["provider"] as Record<string, string>)?.["name"] ?? "openai",
      apiKey: (raw["provider"] as Record<string, string>)?.["apiKey"] ?? "",
      baseUrl:
        (raw["provider"] as Record<string, string>)?.["baseUrl"] ??
        "https://api.openai.com/v1",
    },
  };

  return config;
}

function parseArgs(argv: string[]): {
  command: string | null;
  flags: Record<string, string>;
} {
  const args = argv.slice(2);
  const command = args[0] ?? null;
  const flags: Record<string, string> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    }
  }

  return { command, flags };
}

// ─── Commands ────────────────────────────────────────────────────────────────

async function cmdRun(flags: Record<string, string>): Promise<void> {
  const configPath = flags["agent"];
  if (!configPath) {
    console.error("Error: --agent <config.json> is required for 'run' command");
    process.exit(1);
  }

  const message = flags["message"];
  if (!message) {
    console.error("Error: --message is required for 'run' command");
    process.exit(1);
  }

  console.log(`Loading agent config from ${configPath}...`);
  const config = await loadAgentConfig(configPath);

  // Add built-in tools
  const registry = createDefaultRegistry();
  config.tools = registry.list();

  console.log(`Running agent "${config.name}" (${config.id})...`);
  console.log(`Model: ${config.model}`);
  console.log(`Message: ${message}`);
  console.log("---");

  const agent = new Agent(config);
  const result = await agent.run(message);

  console.log("\n--- Result ---");
  console.log(`State: ${result.state}`);
  console.log(`Iterations: ${result.iterations}`);
  console.log(`Tokens: ${result.tokens.input} in / ${result.tokens.output} out`);
  console.log(`Latency: ${result.latencyMs}ms`);

  if (result.toolCalls.length > 0) {
    console.log(`\nTool calls: ${result.toolCalls.length}`);
    for (const tc of result.toolCalls) {
      console.log(`  - ${tc.name}(${JSON.stringify(tc.args)})`);
    }
  }

  console.log(`\nResponse:\n${result.response}`);
}

function cmdTools(flags: Record<string, string>): void {
  const registry = createDefaultRegistry();

  // If agent config provided, also show custom tools
  const configPath = flags["agent"];
  if (configPath) {
    console.log(`Loading custom tools from ${configPath}...`);
    // In a real implementation, we'd parse tool definitions from the config
    console.log("(Custom tool loading from config not yet implemented)\n");
  }

  console.log(`Available tools (${registry.size()}):\n`);
  for (const tool of registry.list()) {
    const required = Object.entries(tool.parameters)
      .filter(([, p]) => p.required)
      .map(([k]) => k);
    const optional = Object.entries(tool.parameters)
      .filter(([, p]) => !p.required)
      .map(([k]) => k);

    console.log(`  ${tool.name}`);
    console.log(`    ${tool.description}`);
    if (required.length > 0) console.log(`    Required: ${required.join(", ")}`);
    if (optional.length > 0) console.log(`    Optional: ${optional.join(", ")}`);
    console.log();
  }
}

async function cmdValidate(flags: Record<string, string>): Promise<void> {
  const configPath = flags["agent"];
  if (!configPath) {
    console.error("Error: --agent <config.json> is required for 'validate' command");
    process.exit(1);
  }

  console.log(`Validating agent config: ${configPath}`);

  try {
    const config = await loadAgentConfig(configPath);
    const errors: string[] = [];

    if (!config.id) errors.push("Missing 'id'");
    if (!config.name) errors.push("Missing 'name'");
    if (!config.systemPrompt) errors.push("Missing 'systemPrompt'");
    if (!config.model) errors.push("Missing 'model'");
    if (!config.provider) {
      errors.push("Missing 'provider'");
    } else {
      if (!config.provider.name) errors.push("Missing 'provider.name'");
      if (!config.provider.baseUrl) errors.push("Missing 'provider.baseUrl'");
      // apiKey can be empty (e.g., local Ollama)
    }
    if (config.maxIterations < 1) errors.push("maxIterations must be >= 1");
    if (config.maxTokens < 1) errors.push("maxTokens must be >= 1");
    if (config.temperature < 0 || config.temperature > 2)
      errors.push("temperature must be between 0 and 2");

    if (errors.length > 0) {
      console.error("\nValidation FAILED:\n");
      for (const err of errors) {
        console.error(`  ✗ ${err}`);
      }
      process.exit(1);
    }

    console.log("\n✓ Agent config is valid");
    console.log(`  ID: ${config.id}`);
    console.log(`  Name: ${config.name}`);
    console.log(`  Model: ${config.model}`);
    console.log(`  Provider: ${config.provider.name} (${config.provider.baseUrl})`);
    console.log(`  Max iterations: ${config.maxIterations}`);
    console.log(`  Max tokens: ${config.maxTokens}`);
    console.log(`  Temperature: ${config.temperature}`);
  } catch (err) {
    console.error(
      `\n✗ Failed to parse config: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv);

  if (flags["help"] || command === "--help" || command === null) {
    printUsage();
    return;
  }

  if (flags["version"]) {
    printVersion();
    return;
  }

  switch (command) {
    case "run":
      await cmdRun(flags);
      break;
    case "tools":
      cmdTools(flags);
      break;
    case "validate":
      await cmdValidate(flags);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
