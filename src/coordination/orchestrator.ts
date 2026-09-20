/**
 * gz-agent Orchestrator
 *
 * Multi-agent coordinator: register agents, delegate tasks,
 * run parallel or sequential workflows.
 */

import type { Agent } from "../core/agent.js";
import type { AgentResult, AgentTask } from "../core/types.js";

// ─── Orchestrator ────────────────────────────────────────────────────────────

/**
 * Orchestrates multiple agents for complex workflows.
 *
 * - Register agents by ID
 * - Delegate tasks to specific agents
 * - Run tasks in parallel or sequentially
 * - Collect and aggregate results
 */
export class Orchestrator {
  private agents = new Map<string, Agent>();

  /** Register an agent. Overwrites if ID already exists. */
  registerAgent(agent: Agent): void {
    const id = agent.getConfig().id;
    this.agents.set(id, agent);
  }

  /** Get an agent by ID. */
  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  /** List all registered agent IDs. */
  listAgents(): string[] {
    return Array.from(this.agents.keys());
  }

  /** Check if an agent is registered. */
  hasAgent(id: string): boolean {
    return this.agents.has(id);
  }

  /** Remove an agent by ID. */
  unregisterAgent(id: string): boolean {
    return this.agents.delete(id);
  }

  /**
   * Delegate a single task to an agent.
   * The agent runs and returns the result.
   */
  async delegate(task: AgentTask): Promise<AgentResult> {
    const agent = this.agents.get(task.agentId);
    if (!agent) {
      task.status = "failed";
      return {
        response: `Error: Agent "${task.agentId}" not registered`,
        messages: [],
        toolCalls: [],
        state: "error",
        iterations: 0,
        tokens: { input: 0, output: 0 },
        latencyMs: 0,
      };
    }

    task.status = "running";
    const startTime = Date.now();

    try {
      const result = await agent.run(task.prompt);
      task.status = "completed";
      task.result = result;
      return result;
    } catch (err) {
      task.status = "failed";
      const errorResult: AgentResult = {
        response: `Task failed: ${err instanceof Error ? err.message : String(err)}`,
        messages: [],
        toolCalls: [],
        state: "error",
        iterations: 0,
        tokens: { input: 0, output: 0 },
        latencyMs: Date.now() - startTime,
      };
      task.result = errorResult;
      return errorResult;
    }
  }

  /**
   * Run multiple tasks in parallel.
   * All tasks are dispatched simultaneously and results are collected.
   */
  async parallel(tasks: AgentTask[]): Promise<AgentResult[]> {
    return Promise.all(tasks.map((task) => this.delegate(task)));
  }

  /**
   * Run tasks sequentially, in order.
   * Each task runs after the previous one completes.
   * Results include a reference to the parent task if specified.
   */
  async sequential(tasks: AgentTask[]): Promise<AgentResult[]> {
    const results: AgentResult[] = [];
    for (const task of tasks) {
      const result = await this.delegate(task);
      results.push(result);
    }
    return results;
  }

  /**
   * Run a pipeline: each task's output becomes the next task's input.
   * Tasks must all target the same agent or different agents.
   * Each task's prompt is the previous task's response.
   */
  async pipeline(
    initialPrompt: string,
    agentIds: string[]
  ): Promise<AgentResult[]> {
    const results: AgentResult[] = [];
    let currentPrompt = initialPrompt;

    for (const agentId of agentIds) {
      const task: AgentTask = {
        id: `pipeline_${agentId}_${Date.now()}`,
        prompt: currentPrompt,
        agentId,
        status: "pending",
      };

      const result = await this.delegate(task);
      results.push(result);
      currentPrompt = result.response;
    }

    return results;
  }

  /**
   * Fan-out: send the same prompt to multiple agents and collect results.
   */
  async fanOut(
    prompt: string,
    agentIds: string[]
  ): Promise<Map<string, AgentResult>> {
    const results = new Map<string, AgentResult>();

    const promises = agentIds.map(async (id) => {
      const task: AgentTask = {
        id: `fanout_${id}_${Date.now()}`,
        prompt,
        agentId: id,
        status: "pending",
      };
      const result = await this.delegate(task);
      results.set(id, result);
    });

    await Promise.all(promises);
    return results;
  }
}
