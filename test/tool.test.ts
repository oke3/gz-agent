import { ToolRegistry } from "../src/core/tool.js";
import type { Tool } from "../src/core/types.js";

const echoTool: Tool = {
  name: "echo",
  description: "Echoes the input back",
  parameters: {
    message: { type: "string", description: "Message to echo", required: true },
  },
  execute: async (args) => `echo: ${args["message"]}`,
};

const addTool: Tool = {
  name: "add",
  description: "Adds two numbers",
  parameters: {
    a: { type: "number", description: "First number", required: true },
    b: { type: "number", description: "Second number", required: true },
  },
  execute: async (args) => String(Number(args["a"]) + Number(args["b"])),
};

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it("registers and retrieves a tool", () => {
    registry.register(echoTool);
    expect(registry.get("echo")).toBe(echoTool);
    expect(registry.size()).toBe(1);
  });

  it("registers multiple tools", () => {
    registry.registerMany([echoTool, addTool]);
    expect(registry.size()).toBe(2);
    expect(registry.has("echo")).toBe(true);
    expect(registry.has("add")).toBe(true);
  });

  it("lists all tools", () => {
    registry.registerMany([echoTool, addTool]);
    const list = registry.list();
    expect(list).toHaveLength(2);
    expect(list.map((t) => t.name)).toContain("echo");
    expect(list.map((t) => t.name)).toContain("add");
  });

  it("unregisters a tool", () => {
    registry.register(echoTool);
    expect(registry.has("echo")).toBe(true);
    const removed = registry.unregister("echo");
    expect(removed).toBe(true);
    expect(registry.has("echo")).toBe(false);
    expect(registry.size()).toBe(0);
  });

  it("returns false when unregistering non-existent tool", () => {
    expect(registry.unregister("nonexistent")).toBe(false);
  });

  it("executes a tool", async () => {
    registry.register(echoTool);
    const result = await registry.execute("echo", { message: "hello" });
    expect(result).toBe("echo: hello");
  });

  it("throws when executing non-existent tool", async () => {
    await expect(
      registry.execute("nonexistent", {})
    ).rejects.toThrow('Tool "nonexistent" is not registered');
  });

  it("generates OpenAI function definitions", () => {
    registry.register(addTool);
    const defs = registry.getDefinitions();
    expect(defs).toHaveLength(1);

    const def = defs[0]!;
    expect(def.type).toBe("function");
    expect(def.function.name).toBe("add");
    expect(def.function.parameters.type).toBe("object");
    expect(def.function.parameters.required).toContain("a");
    expect(def.function.parameters.required).toContain("b");
    expect(def.function.parameters.properties["a"]!.type).toBe("number");
  });

  it("overwrites tool with same name", () => {
    registry.register(echoTool);
    const newEcho: Tool = {
      ...echoTool,
      description: "Updated echo",
    };
    registry.register(newEcho);
    expect(registry.size()).toBe(1);
    expect(registry.get("echo")!.description).toBe("Updated echo");
  });
});
