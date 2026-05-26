"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useReverification, useUser } from "@clerk/nextjs";
import {
  CopilotKit,
  CopilotSidebar,
  useAgent,
  UseAgentUpdate,
  useConfigureSuggestions,
} from "@copilotkit/react-core/v2";
import { Streamdown } from "streamdown";
import { CartItem, GroceryState, PantryItem } from "@agents/types";
import { ShoppingCart } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HeroHeader } from "@/components/hero-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuthConnection } from "@/lib/use-auth-connection";
import { cn } from "@/lib/utils";

const KROGER_PROVIDER = "custom_shopping";
const KROGER_STRATEGY = "oauth_custom_shopping";

type GroceryStatus = NonNullable<GroceryState["status"]>;

const STATUS_META: Record<
  GroceryStatus,
  { label: string; dotClass: string; chipClass: string }
> = {
  idle: {
    label: "No plan yet",
    dotClass: "bg-[var(--ink-mute)]",
    chipClass: "text-[var(--ink-soft)] bg-[var(--bg-soft)]",
  },
  planning: {
    label: "Planning",
    dotClass: "bg-[var(--accent)] animate-pulse",
    chipClass: "text-[var(--accent-strong)] bg-[var(--accent-soft)]",
  },
  ready: {
    label: "Ready to shop",
    dotClass: "bg-[var(--success)]",
    chipClass:
      "text-[var(--success)] bg-[var(--success-soft)] dark:bg-[color-mix(in_srgb,var(--success)_16%,transparent)]",
  },
};

function KrogerAuthGate({
  onConnect,
  connecting,
}: {
  onConnect: () => void;
  connecting: boolean;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="w-12 h-12 rounded-2xl bg-[var(--accent-soft)] flex items-center justify-center">
        <ShoppingCart className="w-6 h-6 text-[var(--accent-strong)]" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-[var(--ink)]">
          Connect your Kroger account
        </h2>
        <p className="text-sm text-[var(--ink-mute)] max-w-sm">
          The grocery planner needs access to your Kroger account to search
          products, check weekly deals, and manage your shopping list.
        </p>
      </div>
      <Button
        onClick={onConnect}
        disabled={connecting}
        size="lg"
      >
        {connecting ? "Connecting…" : "Connect Kroger"}
      </Button>
      <p className="text-xs text-[var(--ink-mute)]">
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
  const krogerConnection = useAuthConnection({
    endpoint: "/api/mcp/token",
    enabled: Boolean(isLoaded && user),
    queryKey: ["auth-connection", "kroger"],
  });

  const state = (agent?.state ?? {}) as GroceryState;
  const shoppingList = state.shopping_list ?? [];
  const cart = state.cart ?? [];
  const pantry = state.pantry ?? [];
  const mealPlan = state.meal_plan ?? "";
  const weeklyDeals = state.weekly_deals ?? "";
  const notes = state.notes ?? "";
  const reviewSummary = state.review_summary ?? "";
  const status = (state.status ?? "idle") as GroceryStatus;
  const meta = STATUS_META[status] ?? STATUS_META.idle;
  const isRunning = Boolean(agent?.isRunning);
  const krogerConnected = state.kroger_connected ?? false;

  const cartTotal = useMemo(
    () =>
      cart.reduce(
        (sum, item) => sum + (item.price ?? 0) * (item.quantity ?? 1),
        0,
      ),
    [cart],
  );

  useConfigureSuggestions({
    suggestions: [
      {
        title: "Plan the week",
        message:
          "Plan 5 weeknight dinners for two, then build a shopping list I can check out at Kroger.",
      },
      {
        title: "Use what I have",
        message:
          "Look at my pantry and suggest meals that use what's already there before it expires.",
      },
      {
        title: "Find deals",
        message:
          "What are this week's best deals at my store, and which ones should I build meals around?",
      },
      {
        title: "Ready to shop?",
        message:
          "If the list looks good, finalize it and mark it ready to shop.",
      },
    ],
    available: "always",
  });

  useEffect(() => {
    if (!agent || !krogerConnection.data) return;

    const current = (agent.state ?? {}) as GroceryState;
    if (current.kroger_connected === krogerConnection.data.connected) return;

    agent.setState({
      ...current,
      kroger_connected: krogerConnection.data.connected,
    });
  }, [agent, krogerConnection.data]);

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
    <main
      className="min-h-full flex flex-col"
      style={{
        "--page-color": "var(--grocery)",
        "--page-color-soft": "var(--grocery-soft)",
      } as React.CSSProperties}
    >
      <HeroHeader
        name="Grocery Studio"
        description="Plan meals and build a Kroger cart with an AI partner."
        icon={<ShoppingCart className="w-5 h-5" />}
        isRunning={isRunning}
        statusLabel={meta.label}
      />

      {!krogerConnected ? (
        <KrogerAuthGate onConnect={handleConnect} connecting={connecting} />
      ) : (
        <div className="flex-1 min-h-0 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 p-4 md:p-6 max-w-[1400px] w-full mx-auto">
          <div className="flex flex-col gap-4 min-w-0">
            <ShoppingListCard
              items={shoppingList}
              notes={notes}
              reviewSummary={status === "ready" ? reviewSummary : ""}
            />
            <CartCard items={cart} total={cartTotal} />
          </div>

          <div className="flex flex-col gap-4 min-w-0">
            <MealPlanCard plan={mealPlan} isStreaming={isRunning} />
            <DealsCard deals={weeklyDeals} />
            <PantryCard items={pantry} />
          </div>
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

function SectionCard({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card size="sm" className="gap-0 py-0 border-[var(--border)]">
      <CardHeader className="flex-row items-center gap-2 border-b border-[var(--border-soft)] bg-[var(--surface-soft)] px-4 py-3">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {badge}
      </CardHeader>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  );
}

function CountBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <Badge
      variant="outline"
      className="ml-auto h-auto bg-[var(--bg-soft)] px-2 py-0.5 font-mono text-[10px] tracking-wider text-[var(--ink-mute)]"
    >
      {n}
    </Badge>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[var(--ink-mute)]">{children}</p>;
}

function ShoppingListCard({
  items,
  notes,
  reviewSummary,
}: {
  items: string[];
  notes: string;
  reviewSummary: string;
}) {
  return (
    <SectionCard title="Shopping list" badge={<CountBadge n={items.length} />}>
      {items.length === 0 ? (
        <EmptyHint>Ask the agent to build your list.</EmptyHint>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li
              key={i}
              className="flex items-center gap-2.5 text-sm text-[var(--ink)]"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      )}

      {notes && (
        <div className="mt-3 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--ink-soft)] streamdown-markdown">
          <Streamdown>{notes}</Streamdown>
        </div>
      )}

      {reviewSummary && (
        <div className="mt-3 rounded-xl border border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[color-mix(in_srgb,var(--success)_8%,transparent)] px-3 py-2 text-xs text-[var(--ink-soft)]">
          <span className="font-semibold text-[var(--success)]">
            Ready to shop:
          </span>{" "}
          {reviewSummary}
        </div>
      )}
    </SectionCard>
  );
}

function CartCard({ items, total }: { items: CartItem[]; total: number }) {
  return (
    <SectionCard
      title="Cart"
      badge={
        total > 0 ? (
          <Badge className="ml-auto h-auto bg-transparent px-0 text-sm font-semibold text-[var(--ink)]">
            ${total.toFixed(2)}
          </Badge>
        ) : (
          <CountBadge n={items.length} />
        )
      }
    >
      {items.length === 0 ? (
        <EmptyHint>
          Connected to Kroger — ask the agent to add items to your cart.
        </EmptyHint>
      ) : (
        <ul className="divide-y divide-[var(--border-soft)]">
          {items.map((item, i) => (
            <li
              key={item.upc ?? `${item.name}-${i}`}
              className="flex items-center gap-3 py-2 first:pt-0 last:pb-0 text-sm"
            >
              <span className="shrink-0 w-7 h-7 rounded-lg bg-[var(--page-color-soft,var(--accent-soft))] text-[var(--page-color,var(--accent-strong))] flex items-center justify-center text-xs font-mono font-semibold">
                {item.quantity ?? 1}
              </span>
              <span className="flex-1 min-w-0 truncate text-[var(--ink)]">
                {item.name}
              </span>
              {typeof item.price === "number" && (
                <span className="shrink-0 font-mono text-[var(--ink-soft)]">
                  ${(item.price * (item.quantity ?? 1)).toFixed(2)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function MealPlanCard({
  plan,
  isStreaming,
}: {
  plan: string;
  isStreaming: boolean;
}) {
  return (
    <SectionCard
      title="Meal plan"
      badge={
        isStreaming ? (
          <Badge className="ml-auto gap-1.5 bg-transparent px-0 text-[10px] font-medium text-[var(--accent-strong)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
            writing
          </Badge>
        ) : undefined
      }
    >
      {plan ? (
        <div className="text-sm text-[var(--ink-soft)] streamdown-markdown">
          <Streamdown>{plan}</Streamdown>
        </div>
      ) : (
        <EmptyHint>Ask the agent to plan your meals.</EmptyHint>
      )}
    </SectionCard>
  );
}

function DealsCard({ deals }: { deals: string }) {
  if (!deals) return null;
  return (
    <SectionCard title="Weekly deals">
      <div className="text-sm text-[var(--ink-soft)] streamdown-markdown">
        <Streamdown>{deals}</Streamdown>
      </div>
    </SectionCard>
  );
}

function PantryCard({ items }: { items: PantryItem[] }) {
  if (items.length === 0) return null;
  return (
    <SectionCard title="Pantry" badge={<CountBadge n={items.length} />}>
      <ul className="grid grid-cols-2 gap-2">
        {items.map((item, i) => (
          <li key={`${item.name}-${i}`}>
            <Card
              size="sm"
              className="gap-0 border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-2"
            >
              <div className="text-sm text-[var(--ink)] truncate">
                {item.name}
              </div>
              <div className="text-[11px] text-[var(--ink-mute)] flex items-center gap-1.5">
                <span>{item.quantity}</span>
                {item.expires && (
                  <>
                    <span>·</span>
                    <span>exp {item.expires}</span>
                  </>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </SectionCard>
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
