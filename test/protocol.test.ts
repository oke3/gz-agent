import { Protocol } from "../src/coordination/protocol.js";
import type { AgentTask } from "../src/core/types.js";

describe("Protocol", () => {
  it("creates messages with correct structure", () => {
    const msg = Protocol.createMessage(
      "task_delegate",
      "orchestrator",
      "agent-1",
      { prompt: "do something" }
    );

    expect(msg.id).toMatch(/^msg_/);
    expect(msg.type).toBe("task_delegate");
    expect(msg.from).toBe("orchestrator");
    expect(msg.to).toBe("agent-1");
    expect(msg.timestamp).toBeGreaterThan(0);
    expect(msg.payload).toEqual({ prompt: "do something" });
  });

  it("dispatches to registered handlers", async () => {
    const protocol = new Protocol();
    const received: unknown[] = [];

    protocol.on("task_delegate", async (msg) => {
      received.push(msg.payload);
      return null;
    });

    const msg = Protocol.createMessage(
      "task_delegate",
      "a",
      "b",
      { task: "test" }
    );
    await protocol.dispatch(msg);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ task: "test" });
  });

  it("collects responses from handlers", async () => {
    const protocol = new Protocol();

    protocol.on("heartbeat", async (msg) => {
      return Protocol.createMessage(
        "status_response",
        msg.to,
        msg.from,
        { status: "alive" }
      );
    });

    const msg = Protocol.createMessage("heartbeat", "a", "b", {});
    const responses = await protocol.dispatch(msg);

    expect(responses).toHaveLength(1);
    expect(responses[0]!.type).toBe("status_response");
    expect(responses[0]!.from).toBe("b");
    expect(responses[0]!.to).toBe("a");
  });

  it("sends via transport", async () => {
    const protocol = new Protocol();
    const sent: unknown[] = [];

    protocol.setTransport(async (msg) => {
      sent.push(msg);
      return true;
    });

    const result = await protocol.delegateTask("a", "b", {
      id: "t1",
      prompt: "test",
      agentId: "b",
      status: "pending",
    } as AgentTask);

    expect(result).toBe(true);
    expect(sent).toHaveLength(1);
    expect((sent[0] as { type: string }).type).toBe("task_delegate");
  });

  it("throws when sending without transport", async () => {
    const protocol = new Protocol();
    const msg = Protocol.createMessage("heartbeat", "a", "b", {});

    await expect(protocol.send(msg)).rejects.toThrow(
      "No transport configured"
    );
  });

  it("sends result and error messages", async () => {
    const protocol = new Protocol();
    const sent: unknown[] = [];

    protocol.setTransport(async (msg) => {
      sent.push(msg);
      return true;
    });

    await protocol.sendResult("a", "b", "t1", {
      response: "done",
      messages: [],
      toolCalls: [],
      state: "responding",
      iterations: 1,
      tokens: { input: 10, output: 20 },
      latencyMs: 100,
    });

    await protocol.sendError("a", "b", "t1", "something broke");

    expect(sent).toHaveLength(2);
    expect((sent[0] as { type: string }).type).toBe("task_result");
    expect((sent[1] as { type: string }).type).toBe("task_error");
  });

  it("removes handlers", async () => {
    const protocol = new Protocol();
    let called = false;

    protocol.on("heartbeat", async () => {
      called = true;
      return null;
    });

    protocol.off("heartbeat");

    const msg = Protocol.createMessage("heartbeat", "a", "b", {});
    await protocol.dispatch(msg);

    expect(called).toBe(false);
  });
});
