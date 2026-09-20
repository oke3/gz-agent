/**
 * gz-agent Inter-Agent Communication Protocol
 *
 * Defines the message format and transport abstraction for
 * agent-to-agent communication.
 */

import type { AgentTask, AgentResult } from "../core/types.js";

// ─── Protocol Messages ───────────────────────────────────────────────────────

/** Types of inter-agent messages. */
export type ProtocolMessageType =
  | "task_delegate"
  | "task_result"
  | "task_error"
  | "heartbeat"
  | "status_request"
  | "status_response";

/** A message sent between agents. */
export interface ProtocolMessage {
  id: string;
  type: ProtocolMessageType;
  from: string;
  to: string;
  timestamp: number;
  payload: unknown;
}

/** Delegate payload — assign a task to another agent. */
export interface DelegatePayload {
  task: AgentTask;
}

/** Result payload — return a task result. */
export interface ResultPayload {
  taskId: string;
  result: AgentResult;
}

/** Error payload — report a task failure. */
export interface ErrorPayload {
  taskId: string;
  error: string;
}

// ─── Transport Abstraction ───────────────────────────────────────────────────

/** Send a message to an agent. Returns true on success. */
export type TransportSend = (message: ProtocolMessage) => Promise<boolean>;

/** Handler for incoming protocol messages. */
export type MessageHandler = (
  message: ProtocolMessage
) => Promise<ProtocolMessage | null>;

// ─── Protocol ────────────────────────────────────────────────────────────────

/**
 * The inter-agent communication protocol.
 *
 * Handles message creation, serialization, and routing.
 * Transport-agnostic — plug in any send/receive mechanism.
 */
export class Protocol {
  private handlers = new Map<ProtocolMessageType, MessageHandler[]>();
  private sendFn: TransportSend | null = null;

  /** Set the transport send function. */
  setTransport(send: TransportSend): void {
    this.sendFn = send;
  }

  /** Register a handler for a message type. */
  on(type: ProtocolMessageType, handler: MessageHandler): void {
    const handlers = this.handlers.get(type) ?? [];
    handlers.push(handler);
    this.handlers.set(type, handlers);
  }

  /** Remove all handlers for a type. */
  off(type: ProtocolMessageType): void {
    this.handlers.delete(type);
  }

  /** Create a protocol message. */
  static createMessage(
    type: ProtocolMessageType,
    from: string,
    to: string,
    payload: unknown
  ): ProtocolMessage {
    return {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      from,
      to,
      timestamp: Date.now(),
      payload,
    };
  }

  /** Send a message via the configured transport. */
  async send(message: ProtocolMessage): Promise<boolean> {
    if (!this.sendFn) {
      throw new Error("No transport configured. Call setTransport() first.");
    }
    return this.sendFn(message);
  }

  /** Dispatch an incoming message to registered handlers. */
  async dispatch(message: ProtocolMessage): Promise<ProtocolMessage[]> {
    const handlers = this.handlers.get(message.type) ?? [];
    const responses: ProtocolMessage[] = [];

    for (const handler of handlers) {
      const response = await handler(message);
      if (response) {
        responses.push(response);
      }
    }

    return responses;
  }

  /** Create and send a task delegation message. */
  async delegateTask(
    from: string,
    to: string,
    task: AgentTask
  ): Promise<boolean> {
    const msg = Protocol.createMessage("task_delegate", from, to, {
      task,
    } satisfies DelegatePayload);
    return this.send(msg);
  }

  /** Create and send a task result message. */
  async sendResult(
    from: string,
    to: string,
    taskId: string,
    result: AgentResult
  ): Promise<boolean> {
    const msg = Protocol.createMessage("task_result", from, to, {
      taskId,
      result,
    } satisfies ResultPayload);
    return this.send(msg);
  }

  /** Create and send a task error message. */
  async sendError(
    from: string,
    to: string,
    taskId: string,
    error: string
  ): Promise<boolean> {
    const msg = Protocol.createMessage("task_error", from, to, {
      taskId,
      error,
    } satisfies ErrorPayload);
    return this.send(msg);
  }
}
