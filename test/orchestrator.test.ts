import { Orchestrator } from "../src/coordination/orchestrator.js";
import { Agent } from "../src/core/agent.js";
import type { AgentConfig, AgentTask } from "../src/core/types.js";

function makeConfig(id: string): AgentConfig {
  return {
    id,
    name: `Agent ${id}`,
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
  };
}

function makeTask(agentId: string, prompt = "test prompt"): AgentTask {
  return {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    prompt,
    agentId,
    status: "pending",
  };
}

describe("Orchestrator", () => {
  let orchestrator: Orchestrator;

  beforeEach(() => {
    orchestrator = new Orchestrator();
  });

  it("registers and retrieves agents", () => {
    const agent = new Agent(makeConfig("a1"));
    orchestrator.registerAgent(agent);

    expect(orchestrator.hasAgent("a1")).toBe(true);
    expect(orchestrator.getAgent("a1")).toBe(agent);
    expect(orchestrator.listAgents()).toContain("a1");
  });

  it("unregisters agents", () => {
    const agent = new Agent(makeConfig("a1"));
    orchestrator.registerAgent(agent);
    expect(orchestrator.hasAgent("a1")).toBe(true);

    orchestrator.unregisterAgent("a1");
    expect(orchestrator.hasAgent("a1")).toBe(false);
  });

  it("delegates task to agent", async () => {
    const agent = new Agent(makeConfig("a1"));
    orchestrator.registerAgent(agent);

    const task = makeTask("a1");
    const result = await orchestrator.delegate(task);

    expect(task.status).toBe("completed");
    expect(result.state).toBe("error"); // LLM endpoint unreachable
    expect(result.response).toContain("error");
  });

  it("returns error for unknown agent", async () => {
    const task = makeTask("nonexistent");
    const result = await orchestrator.delegate(task);

    expect(task.status).toBe("failed");
    expect(result.response).toContain("not registered");
    expect(result.state).toBe("error");
  });

  it("runs parallel tasks", async () => {
    const agent1 = new Agent(makeConfig("a1"));
    const agent2 = new Agent(makeConfig("a2"));
    orchestrator.registerAgent(agent1);
    orchestrator.registerAgent(agent2);

    const tasks = [makeTask("a1"), makeTask("a2")];
    const results = await orchestrator.parallel(tasks);

    expect(results).toHaveLength(2);
    expect(tasks[0]!.status).toBe("completed");
    expect(tasks[1]!.status).toBe("completed");
  });

  it("runs sequential tasks", async () => {
    const agent = new Agent(makeConfig("a1"));
    orchestrator.registerAgent(agent);

    const tasks = [makeTask("a1"), makeTask("a1")];
    const results = await orchestrator.sequential(tasks);

    expect(results).toHaveLength(2);
    expect(tasks[0]!.status).toBe("completed");
    expect(tasks[1]!.status).toBe("completed");
  });

  it("pipeline chains task outputs", async () => {
    const agent = new Agent(makeConfig("a1"));
    orchestrator.registerAgent(agent);

    const results = await orchestrator.pipeline("initial prompt", [
      "a1",
      "a1",
    ]);

    expect(results).toHaveLength(2);
    // Both will fail because LLM is unreachable, but pipeline still runs
    expect(results[0]!.state).toBe("error");
    expect(results[1]!.state).toBe("error");
  });

  it("fan-out sends same prompt to multiple agents", async () => {
    const agent1 = new Agent(makeConfig("a1"));
    const agent2 = new Agent(makeConfig("a2"));
    orchestrator.registerAgent(agent1);
    orchestrator.registerAgent(agent2);

    const results = await orchestrator.fanOut("shared prompt", ["a1", "a2"]);

    expect(results.size).toBe(2);
    expect(results.has("a1")).toBe(true);
    expect(results.has("a2")).toBe(true);
  });
});
