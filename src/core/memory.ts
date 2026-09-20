/**
 * gz-agent Memory
 *
 * Two-tier memory system:
 * 1. Working memory — current conversation messages
 * 2. Long-term memory — persistent facts extracted from conversations (JSONL)
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { Message, MemoryFact } from "./types.js";

const DEFAULT_DATA_DIR = join(
  process.env["HOME"] ?? "/tmp",
  ".gz-agent",
  "memory"
);

// ─── Working Memory ──────────────────────────────────────────────────────────

/** In-memory conversation history (current session). */
export class WorkingMemory {
  private messages: Message[] = [];

  /** Get all messages. */
  getAll(): Message[] {
    return [...this.messages];
  }

  /** Get the last N messages. */
  getLast(n: number): Message[] {
    return this.messages.slice(-n);
  }

  /** Add a message. */
  add(message: Message): void {
    this.messages.push(message);
  }

  /** Clear all messages. */
  clear(): void {
    this.messages = [];
  }

  /** Get total message count. */
  size(): number {
    return this.messages.length;
  }

  /** Serialize to array. */
  toJSON(): Message[] {
    return [...this.messages];
  }

  /** Deserialize from array. */
  fromJSON(messages: Message[]): void {
    this.messages = [...messages];
  }
}

// ─── Long-Term Memory ────────────────────────────────────────────────────────

/**
 * Persistent fact store backed by a JSONL file.
 *
 * Each line is a JSON-serialized MemoryFact.
 * Simple substring matching for search (upgrade to vector search as needed).
 */
export class LongTermMemory {
  private facts: MemoryFact[] = [];
  private filePath: string;

  constructor(dataDir: string = DEFAULT_DATA_DIR) {
    this.filePath = join(dataDir, "facts.jsonl");
  }

  /** Load facts from disk. */
  async load(): Promise<void> {
    try {
      const content = await readFile(this.filePath, "utf-8");
      this.facts = content
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as MemoryFact);
    } catch {
      // File doesn't exist yet — start empty
      this.facts = [];
    }
  }

  /** Save facts to disk (ensures directory exists). */
  async save(): Promise<void> {
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true });
    const content = this.facts
      .map((f) => JSON.stringify(f))
      .join("\n");
    await writeFile(this.filePath, content + (content.length > 0 ? "\n" : ""), "utf-8");
  }

  /** Add a fact. */
  add(fact: string, source: string): void {
    this.facts.push({
      fact,
      source,
      timestamp: Date.now(),
    });
  }

  /**
   * Search facts by substring match (case-insensitive).
   * Returns matching facts sorted by relevance (most recent first).
   */
  search(query: string): string[] {
    const lower = query.toLowerCase();
    return this.facts
      .filter((f) => f.fact.toLowerCase().includes(lower))
      .sort((a, b) => b.timestamp - a.timestamp)
      .map((f) => f.fact);
  }

  /** Get all facts. */
  getAll(): MemoryFact[] {
    return [...this.facts];
  }

  /** Get fact count. */
  size(): number {
    return this.facts.length;
  }

  /** Clear all facts. */
  clear(): void {
    this.facts = [];
  }
}

// ─── Combined Memory ─────────────────────────────────────────────────────────

/**
 * Unified memory interface combining working and long-term storage.
 */
export class Memory {
  private working: WorkingMemory;
  private longTerm: LongTermMemory;

  constructor(dataDir?: string) {
    this.working = new WorkingMemory();
    this.longTerm = new LongTermMemory(dataDir);
  }

  // ── Working Memory ──

  /** Get all working memory messages. */
  getWorking(): Message[] {
    return this.working.getAll();
  }

  /** Get the last N working memory messages. */
  getWorkingLast(n: number): Message[] {
    return this.working.getLast(n);
  }

  /** Add a message to working memory. */
  addWorking(message: Message): void {
    this.working.add(message);
  }

  /** Clear working memory. */
  clearWorking(): void {
    this.working.clear();
  }

  /** Working memory size. */
  workingSize(): number {
    return this.working.size();
  }

  // ── Long-Term Memory ──

  /** Add a fact to long-term memory. */
  addFact(fact: string, source: string): void {
    this.longTerm.add(fact, source);
  }

  /** Search long-term memory. */
  searchFacts(query: string): string[] {
    return this.longTerm.search(query);
  }

  /** Get all facts. */
  getAllFacts(): MemoryFact[] {
    return this.longTerm.getAll();
  }

  /** Long-term memory size. */
  longTermSize(): number {
    return this.longTerm.size();
  }

  // ── Persistence ──

  /** Save long-term memory to disk. */
  async save(): Promise<void> {
    await this.longTerm.save();
  }

  /** Load long-term memory from disk. */
  async load(): Promise<void> {
    await this.longTerm.load();
  }
}
