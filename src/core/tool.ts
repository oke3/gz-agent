/**
 * gz-agent Tool Registry
 *
 * Manages tool registration, validation, definition export (OpenAI format),
 * and execution with timeout support.
 */

import { readFile, writeFile, readdir } from "node:fs/promises";
import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import type { Tool, OpenAIToolDefinition } from "./types.js";

const execAsync = promisify(execCb);

// ─── Built-in Tools ──────────────────────────────────────────────────────────

/** Web search stub — users provide their own implementation. */
export const webSearchTool: Tool = {
  name: "web_search",
  description: "Search the web for information. Requires a custom implementation to be useful.",
  parameters: {
    query: { type: "string", description: "The search query", required: true },
    numResults: {
      type: "number",
      description: "Number of results to return",
      required: false,
    },
  },
  execute: async () =>
    "Web search is not configured. Provide a custom implementation via ToolRegistry.register().",
};

/** Read a file from disk. */
export const readFileTool: Tool = {
  name: "read_file",
  description: "Read the contents of a file from disk.",
  parameters: {
    path: {
      type: "string",
      description: "Absolute or relative path to the file",
      required: true,
    },
  },
  execute: async (args) => {
    const path = args["path"];
    if (typeof path !== "string") return "Error: 'path' must be a string";
    try {
      const content = await readFile(path, "utf-8");
      return content;
    } catch (err) {
      return `Error reading file: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

/** Write a file to disk. */
export const writeFileTool: Tool = {
  name: "write_file",
  description: "Write content to a file on disk. Creates parent directories if needed.",
  parameters: {
    path: {
      type: "string",
      description: "Absolute or relative path to write to",
      required: true,
    },
    content: {
      type: "string",
      description: "The content to write",
      required: true,
    },
  },
  execute: async (args) => {
    const path = args["path"];
    const content = args["content"];
    if (typeof path !== "string" || typeof content !== "string")
      return "Error: 'path' and 'content' must be strings";
    try {
      await writeFile(path, content, "utf-8");
      return `Successfully wrote ${content.length} bytes to ${path}`;
    } catch (err) {
      return `Error writing file: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

/** List directory contents. */
export const listDirectoryTool: Tool = {
  name: "list_directory",
  description: "List the contents of a directory.",
  parameters: {
    path: {
      type: "string",
      description: "Absolute or relative path to the directory",
      required: true,
    },
  },
  execute: async (args) => {
    const path = args["path"];
    if (typeof path !== "string") return "Error: 'path' must be a string";
    try {
      const entries = await readdir(path, { withFileTypes: true });
      return entries
        .map((e) => `${e.isDirectory() ? "[DIR]" : "      "} ${e.name}`)
        .join("\n");
    } catch (err) {
      return `Error listing directory: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

/** Execute a shell command with timeout. */
export const runCommandTool: Tool = {
  name: "run_command",
  description: "Execute a shell command with a timeout. Use with caution.",
  parameters: {
    command: {
      type: "string",
      description: "The shell command to execute",
      required: true,
    },
    timeout: {
      type: "number",
      description: "Timeout in milliseconds (default: 30000)",
      required: false,
    },
  },
  execute: async (args) => {
    const command = args["command"];
    if (typeof command !== "string") return "Error: 'command' must be a string";
    const timeout = typeof args["timeout"] === "number" ? args["timeout"] : 30000;
    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout,
        maxBuffer: 1024 * 1024, // 1MB
      });
      const parts: string[] = [];
      if (stdout) parts.push(stdout.trim());
      if (stderr) parts.push(`STDERR: ${stderr.trim()}`);
      return parts.length > 0 ? parts.join("\n") : "(no output)";
    } catch (err) {
      if (err instanceof Error && "killed" in err && (err as { killed: boolean }).killed) {
        return `Error: command timed out after ${timeout}ms`;
      }
      return `Error running command: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

/** All built-in tools. */
export const BUILTIN_TOOLS: Tool[] = [
  webSearchTool,
  readFileTool,
  writeFileTool,
  listDirectoryTool,
  runCommandTool,
];

// ─── ToolRegistry ────────────────────────────────────────────────────────────

/**
 * Registry for tool management.
 *
 * Supports registration, lookup, OpenAI-format export, and execution
 * with name-based dispatch.
 */
export class ToolRegistry {
  private tools = new Map<string, Tool>();

  /** Register a single tool. Overwrites if name already exists. */
  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  /** Register multiple tools at once. */
  registerMany(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /** Get a tool by name. */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /** List all registered tools. */
  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  /** Get tool count. */
  size(): number {
    return this.tools.size;
  }

  /** Check if a tool is registered. */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** Remove a tool by name. Returns true if it existed. */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Get tool definitions in OpenAI function-calling format.
   * Suitable for passing to the `tools` parameter of an LLM API call.
   */
  getDefinitions(): OpenAIToolDefinition[] {
    return this.list().map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: "object" as const,
          properties: Object.fromEntries(
            Object.entries(tool.parameters).map(([key, param]) => [
              key,
              {
                type: param.type,
                description: param.description,
                ...(param.enum ? { enum: param.enum } : {}),
              },
            ])
          ),
          required: Object.entries(tool.parameters)
            .filter(([, param]) => param.required === true)
            .map(([key]) => key),
        },
      },
    }));
  }

  /**
   * Execute a tool by name with the given arguments.
   * @throws Error if tool is not found.
   */
  async execute(
    name: string,
    args: Record<string, unknown>
  ): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool "${name}" is not registered`);
    }
    return tool.execute(args);
  }
}

/** Create a registry pre-loaded with all built-in tools. */
export function createDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.registerMany(BUILTIN_TOOLS);
  return registry;
}
