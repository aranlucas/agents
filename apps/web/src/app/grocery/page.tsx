"use client";

import React, { useEffect, useState } from "react";
import { useReverification, useUser } from "@clerk/nextjs";
import {
  CopilotKit,
  CopilotSidebar,
  useAgent,
  UseAgentUpdate,
} from "@copilotkit/react-core/v2";
import { GroceryState } from "@agents/types";

const KROGER_PROVIDER = "custom_shopping";
const KROGER_STRATEGY = "oauth_custom_shopping";

function KrogerAuthGate({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Connect your Kroger account</h2>
        <p className="text-sm text-gray-500 max-w-sm">
          The grocery planner needs access to your Kroger account to search
          products, check weekly deals, and manage your shopping list.
        </p>
      </div>
      <button
        onClick={onConnect}
        className="px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
      >
        Connect Kroger
      </button>
      <p className="text-xs text-gray-400">
        You&apos;ll be redirected to authorize access, then returned here.
      </p>
    </div>
  );
}

function GroceryPageInner() {
  const { user, isLoaded } = useUser();
  const [connecting, setConnecting] = useState(false);

  const connectKroger = useReverification(async () => {
    if (!user) return;
    const existingAccount = user.externalAccounts.find(
      ({ provider }) => provider === KROGER_PROVIDER,
    );

    const account = existingAccount
      ? await existingAccount.reauthorize({ redirectUrl: window.location.href })
      : await user.createExternalAccount({
          strategy: KROGER_STRATEGY,
          redirectUrl: window.location.href,
        });
    const redirectUrl = account.verification?.externalVerificationRedirectURL?.href;
    if (redirectUrl) {
      window.location.assign(redirectUrl);
    }
  });

  const { agent } = useAgent({
    agentId: "grocery",
    updates: [UseAgentUpdate.OnStateChanged, UseAgentUpdate.OnRunStatusChanged],
  });

  const state = (agent?.state ?? {}) as GroceryState;
  const shoppingList = state.shopping_list ?? [];
  const mealPlan = state.meal_plan ?? "";
  const status = state.status ?? "idle";
  const isRunning = Boolean(agent?.isRunning);
  const krogerConnected = state.kroger_connected ?? false;

  // On load (and after Clerk user is ready), fetch the MCP token from our
  // server route. If the "shopping" OAuth account is connected, push the
  // token into agent state so the Python header_provider can use it.
  useEffect(() => {
    if (!agent || !isLoaded || !user) return;

    fetch("/api/mcp/token")
      .then((r) => r.json())
      .then(({ connected, token }: { connected: boolean; token: string | null }) => {
        const current = (agent.state ?? {}) as GroceryState;
        agent.setState({
          ...current,
          kroger_connected: connected,
          kroger_token: token ?? undefined,
        });
      })
      .catch(() => {/* stay in disconnected state */});
  }, [agent, isLoaded, user]);

  const handleConnect = async () => {
    if (!user || connecting) return;
    setConnecting(true);
    try {
      await connectKroger();
      // Clerk will redirect — no need to reset connecting state
    } catch (err) {
      console.error("Connect failed:", err);
      setConnecting(false);
    }
  };

  return (
    <main className="min-h-full flex flex-col">
      <header className="px-6 py-4 border-b border-gray-200 flex items-center gap-3">
        <h1 className="text-xl font-semibold">Grocery Planner</h1>
        {isRunning && (
          <span className="text-sm text-gray-500 animate-pulse">Planning…</span>
        )}
        <span className="ml-auto text-sm text-gray-400 capitalize">{status}</span>
      </header>

      {!krogerConnected ? (
        <KrogerAuthGate onConnect={handleConnect} />
      ) : (
        <div className="flex-1 grid md:grid-cols-2 gap-4 p-4 md:p-6 max-w-[1200px] w-full mx-auto">
          <section className="space-y-3">
            <h2 className="font-medium text-gray-700">Shopping List</h2>
            {shoppingList.length === 0 ? (
              <p className="text-sm text-gray-400">Ask the agent to build your list.</p>
            ) : (
              <ul className="space-y-1">
                {shoppingList.map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="font-medium text-gray-700">Meal Plan</h2>
            {mealPlan ? (
              <pre className="text-sm whitespace-pre-wrap text-gray-600">{mealPlan}</pre>
            ) : (
              <p className="text-sm text-gray-400">Ask the agent to plan your meals.</p>
            )}
          </section>
        </div>
      )}

      <CopilotSidebar
        agentId="grocery"
        defaultOpen={false}
        labels={{
          modalHeaderTitle: "Grocery Planner",
          chatInputPlaceholder: "Plan meals, build a shopping list, find deals…",
        }}
      />
    </main>
  );
}

export default function GroceryPage() {
  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      agent="grocery"
      useSingleEndpoint={false}
      enableInspector={process.env.NODE_ENV !== "production"}
    >
      <GroceryPageInner />
    </CopilotKit>
  );
}
