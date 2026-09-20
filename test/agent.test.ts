import { Agent } from "../src/core/agent.js";
import type { AgentConfig, Tool } from "../src/core/types.js";

function makeConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  return {
    id: "test-agent",
    name: "Test Agent",
    systemPrompt: "You are a test agent.",
    tools: [],
    model: "gpt-4o-mini",
    maxIterations: 3,
    maxTokens: 100,
    temperature: 0,
    provider: {
      name: "test",
      apiKey: "test-key",
      baseUrl: "http://localhost:9999",
    },
    ...overrides,
  };
}

describe("Agent", () => {
  it("starts in idle state", () => {
    const agent = new Agent(makeConfig());
    expect(agent.getState()).toBe("idle");
  });

  it("can be reset", () => {
    const agent = new Agent(makeConfig());
    agent.reset();
    expect(agent.getState()).toBe("idle");
    expect(agent.getMessages()).toHaveLength(0);
  });

  it("returns error state when LLM endpoint is unreachable", async () => {
    const agent = new Agent(makeConfig());
    const result = await agent.run("hello");

    expect(result.state).toBe("error");
    expect(result.response).toContain("error");
    expect(result.iterations).toBe(1);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("holds config correctly", () => {
    const config = makeConfig({ id: "custom-1", name: "Custom" });
    const agent = new Agent(config);
    expect(agent.getConfig().id).toBe("custom-1");
    expect(agent.getConfig().name).toBe("Custom");
  });

  it("has a tool registry", () => {
    const agent = new Agent(makeConfig());
    expect(agent.getRegistry()).toBeDefined();
    expect(agent.getRegistry().size()).toBe(0);
  });

  it("has a memory instance", () => {
    const agent = new Agent(makeConfig());
    expect(agent.getMemory()).toBeDefined();
  });
});
