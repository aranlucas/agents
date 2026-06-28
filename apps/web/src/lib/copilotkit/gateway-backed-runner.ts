import { InMemoryAgentRunner } from "@copilotkit/runtime/v2";
import { EventType } from "@ag-ui/client";
import type { BaseEvent } from "@ag-ui/client";
import { ReplaySubject } from "rxjs";

type AgentUrlMap = Record<string, string>;

interface ConnectRequest {
  threadId: string;
  headers?: Record<string, string>;
  joinCode?: string;
}

/**
 * Custom AgentRunner that rehydrates persisted thread data from the gateway
 * when the in-memory cache is empty (e.g. after a cold start / deployment).
 *
 * The default InMemoryAgentRunner returns an empty completing Observable for
 * unknown threads, which causes the SSE stream to close immediately with 0
 * events. The client's EventSource enters an error/reconnect loop and the
 * chat never loads.
 *
 * This runner:
 * 1. Checks the in-memory cache first (same as InMemoryAgentRunner)
 * 2. On cache miss, queries each agent's /agents/state endpoint on the
 *    gateway to rehydrate persisted thread data
 * 3. Returns a synthetic RUN_STARTED → [MESSAGES_SNAPSHOT] → [STATE_SNAPSHOT]
 *    → RUN_FINISHED sequence so the client always receives a valid SSE stream
 */
export class GatewayBackedRunner extends InMemoryAgentRunner {
  private agentUrls: AgentUrlMap;

  constructor(agentUrls: AgentUrlMap) {
    super();
    this.agentUrls = agentUrls;
  }

  override connect(request: ConnectRequest) {
    const localMessages = this.getThreadMessages(request.threadId);
    if (localMessages.length > 0) {
      return super.connect(request);
    }

    const subject = new ReplaySubject<BaseEvent>(Infinity);

    void this.fetchGatewayState(request, subject);

    return subject.asObservable();
  }

  private async fetchGatewayState(request: ConnectRequest, subject: ReplaySubject<BaseEvent>) {
    try {
      let threadMessages: unknown[] = [];
      let threadState: Record<string, unknown> = {};

      const agentId = request.headers?.["x-agent-id"];
      const targetUrl = agentId && this.agentUrls[agentId] ? this.agentUrls[agentId] : null;

      const urlsToCheck = targetUrl ? [targetUrl] : Object.values(this.agentUrls);

      const results = await Promise.all(
        urlsToCheck.map(async (agentUrl) => {
          const baseUrl = agentUrl.replace(/\/agui$/, "");
          const stateUrl = `${baseUrl}/agents/state`;
          try {
            const response = await fetch(stateUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...request.headers,
              },
              body: JSON.stringify({ threadId: request.threadId }),
            });
            if (!response.ok) return null;
            const data: {
              threadExists?: boolean;
              messages?: unknown[];
              state?: Record<string, unknown>;
            } = await response.json();
            return data;
          } catch {
            return null;
          }
        }),
      );

      const match = results.find((r) => r?.threadExists);
      if (match) {
        threadMessages = match.messages ?? [];
        threadState = match.state ?? {};
      }

      this.emitSequence(subject, request.threadId, {
        messages: threadMessages,
        state: threadState,
      });
    } catch (error) {
      console.error("[GatewayBackedRunner] Gateway rehydration error:", error);
      this.emitSequence(subject, request.threadId, {
        messages: [],
        state: {},
      });
    } finally {
      subject.complete();
    }
  }

  private emitSequence(
    subject: ReplaySubject<BaseEvent>,
    threadId: string,
    { messages, state }: { messages: unknown[]; state: Record<string, unknown> },
  ) {
    const runId = `connect-${threadId}`;

    subject.next({
      type: EventType.RUN_STARTED,
      threadId,
      runId,
      input: {
        threadId,
        runId,
        messages,
        state,
        tools: [],
        context: [],
        forwardedProps: null,
      },
    } as BaseEvent);

    if (messages.length > 0) {
      subject.next({
        type: EventType.MESSAGES_SNAPSHOT,
        messages,
      } as BaseEvent);
    }

    if (Object.keys(state).length > 0) {
      subject.next({
        type: EventType.STATE_SNAPSHOT,
        snapshot: state,
      } as BaseEvent);
    }

    subject.next({
      type: EventType.RUN_FINISHED,
      threadId,
      runId,
      outcome: { type: "success" },
    } as BaseEvent);
  }
}
