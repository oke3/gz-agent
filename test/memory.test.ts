import { Memory, WorkingMemory, LongTermMemory } from "../src/core/memory.js";
import type { Message } from "../src/core/types.js";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

function makeMessage(role: Message["role"], content: string): Message {
  return { role, content, timestamp: Date.now() };
}

describe("WorkingMemory", () => {
  let memory: WorkingMemory;

  beforeEach(() => {
    memory = new WorkingMemory();
  });

  it("starts empty", () => {
    expect(memory.getAll()).toHaveLength(0);
    expect(memory.size()).toBe(0);
  });

  it("adds messages", () => {
    memory.add(makeMessage("user", "hello"));
    memory.add(makeMessage("assistant", "hi there"));
    expect(memory.size()).toBe(2);
  });

  it("gets last N messages", () => {
    memory.add(makeMessage("user", "a"));
    memory.add(makeMessage("user", "b"));
    memory.add(makeMessage("user", "c"));
    expect(memory.getLast(2)).toHaveLength(2);
    expect(memory.getLast(2)[0]!.content).toBe("b");
  });

  it("clears all messages", () => {
    memory.add(makeMessage("user", "hello"));
    memory.clear();
    expect(memory.size()).toBe(0);
  });

  it("serializes and deserializes", () => {
    memory.add(makeMessage("user", "hello"));
    const json = memory.toJSON();
    const newMemory = new WorkingMemory();
    newMemory.fromJSON(json);
    expect(newMemory.size()).toBe(1);
    expect(newMemory.getAll()[0]!.content).toBe("hello");
  });
});

describe("LongTermMemory", () => {
  let tempDir: string;
  let memory: LongTermMemory;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "gz-agent-test-"));
    memory = new LongTermMemory(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("starts empty", () => {
    expect(memory.size()).toBe(0);
    expect(memory.getAll()).toHaveLength(0);
  });

  it("adds and searches facts", () => {
    memory.add("The sky is blue", "test-source");
    memory.add("Grass is green", "test-source");
    memory.add("Water is wet", "test-source");

    expect(memory.size()).toBe(3);

    const results = memory.search("sky");
    expect(results).toHaveLength(1);
    expect(results[0]).toBe("The sky is blue");
  });

  it("search is case-insensitive", () => {
    memory.add("The SKY is blue", "test");
    const results = memory.search("sky");
    expect(results).toHaveLength(1);
  });

  it("returns empty array for no matches", () => {
    memory.add("fact one", "test");
    const results = memory.search("nonexistent");
    expect(results).toHaveLength(0);
  });

  it("saves and loads from disk", async () => {
    memory.add("persistent fact", "test");
    await memory.save();

    const loaded = new LongTermMemory(tempDir);
    await loaded.load();
    expect(loaded.size()).toBe(1);
    expect(loaded.getAll()[0]!.fact).toBe("persistent fact");
  });

  it("clears all facts", () => {
    memory.add("fact 1", "test");
    memory.add("fact 2", "test");
    memory.clear();
    expect(memory.size()).toBe(0);
  });
});

describe("Memory (combined)", () => {
  let tempDir: string;
  let memory: Memory;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "gz-agent-test-"));
    memory = new Memory(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("manages working memory", () => {
    memory.addWorking(makeMessage("user", "hello"));
    expect(memory.workingSize()).toBe(1);
    expect(memory.getWorking()[0]!.content).toBe("hello");
  });

  it("manages long-term memory", () => {
    memory.addFact("important fact", "test");
    expect(memory.longTermSize()).toBe(1);
    expect(memory.searchFacts("important")).toContain("important fact");
  });

  it("clears working memory", () => {
    memory.addWorking(makeMessage("user", "hello"));
    memory.clearWorking();
    expect(memory.workingSize()).toBe(0);
  });

  it("saves and loads long-term memory", async () => {
    memory.addFact("saved fact", "test");
    await memory.save();

    const loaded = new Memory(tempDir);
    await loaded.load();
    expect(loaded.longTermSize()).toBe(1);
  });
});
