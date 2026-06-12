import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("./app/globals.css", () => ({}));

const agentStates: Record<string, Record<string, unknown>> = {
  travel: {
    destination: "Kyoto",
    start_date: "2026-10-01",
    end_date: "2026-10-07",
    travelers: 2,
    budget_usd: 4500,
    headline: "Temples and food",
    summary: "A balanced week.",
    itinerary: "Intro\n## Day 1: Arrival\n- 09:00 - Land\n## Day 2: Markets\n- 10:00 - Nishiki",
    flights: "UA 1",
    status: "ready_to_book",
    review_summary: "Ready",
  },
  grocery: {
    shopping_list: ["eggs", "rice"],
    cart: [{ name: "Eggs", quantity: 2, price: 4.5, upc: "123" }],
    pantry: [{ name: "Rice", quantity: "1 bag" }],
    meal_plan: "## Monday\n- Dinner",
    weekly_deals: "Apples",
    notes: "Use coupons",
    status: "ready",
    kroger_connected: true,
  },
  fitness: {
    strava_connected: true,
    activities: [{ id: "1", name: "Run", sport_type: "Run", distance_m: 5000 }],
    objective_research: "Trail notes",
    training_plan: "## Week\n- Easy run",
    status: "ready",
  },
  wellness: {
    status: "ready",
    weekly_plan: "## Week\n- Train and eat",
    meal_plan: "Meals",
    workout_plan: "Workouts",
    kroger_connected: true,
    strava_connected: true,
  },
  "oral-boards": {
    case: "## Case\nA 7-year-old presents with pain.",
    case_sources: [{ docid: 1, title: "OCE Guide", collection: "abpd" }],
    phase: "complete",
    transcript: [
      {
        question: "What is your diagnosis?",
        answer: "Irreversible pulpitis",
        feedback: "Cite guideline criteria.",
        citations: [{ docid: 2, title: "Pulp Therapy", collection: "aapd" }],
      },
    ],
    score_card: "## Score Card\n- Diagnosis: 3/4",
    status: "complete",
  },
  a2ui: {
    status: "ready",
    surface_brief: "Dashboard",
    last_surface: "launch-readiness",
  },
};

vi.mock("@/env", () => ({
  env: {
    CLERK_SECRET_KEY: "secret",
    AGENTS_BASE_URL: "http://agents.test",
    COPILOTKIT_DEBUG: false,
  },
}));

vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotKit: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CopilotChat: (props: Record<string, unknown>) => (
    <div data-copilot-chat={props.agent as string} />
  ),
  UseAgentUpdate: { OnStateChanged: "state", OnRunStatusChanged: "run" },
  useAgent: ({ agentId }: { agentId: string }) => ({
    agent: {
      state: agentStates[agentId] ?? {},
      isRunning: agentId === "travel",
      setState: vi.fn(),
    },
  }),
  useAgentContext: vi.fn(),
  useConfigureSuggestions: vi.fn(),
  useDefaultRenderTool: (config: {
    render: (event: {
      name: string;
      parameters?: Record<string, unknown>;
      status: string;
      result?: unknown;
    }) => React.ReactNode;
  }) => {
    config.render({
      name: "request_user_approval",
      status: "executing",
      parameters: { action: "Book" },
    });
    config.render({ name: "write_itinerary", status: "complete", result: { ok: true } });
    config.render({ name: "update_cart", status: "inProgress", parameters: { items: [] } });
    config.render({ name: "set_meal_plan", status: "drafting" });
    config.render({ name: "check_flight", status: "complete" });
    config.render({ name: "set_training_plan", status: "complete" });
    config.render({ name: "delegate_agent", status: "complete" });
    config.render({ name: "render_a2ui_surface", status: "complete" });
    config.render({ name: "unknown_tool", status: "complete" });
    return null;
  },
  useFrontendTool: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignIn: () => <div data-sign-in />,
  SignUp: () => <div data-sign-up />,
  UserProfile: () => <div data-user-profile />,
  useReverification: (fn: unknown) => fn,
  useUser: () => ({
    isLoaded: true,
    user: {
      externalAccounts: [],
      createExternalAccount: vi.fn(async () => ({
        verification: { externalVerificationRedirectURL: { href: "https://auth.test" } },
      })),
    },
  }),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user_123", getToken: vi.fn(async () => "session-jwt") })),
  clerkClient: vi.fn(async () => ({
    users: { getUserOauthAccessToken: vi.fn(async () => ({ data: [{ token: "token" }] })) },
  })),
  clerkMiddleware: (handler: unknown) => handler,
  createRouteMatcher: () => () => true,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/font/google", () => ({
  Schibsted_Grotesk: () => ({ variable: "font-sans" }),
  JetBrains_Mono: () => ({ variable: "font-mono" }),
}));

vi.mock("streamdown", () => ({
  Streamdown: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@tanstack/react-query", () => ({
  QueryClient: class QueryClient {},
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useQuery: () => ({ data: { connected: true }, isLoading: false, error: null }),
}));

vi.mock("@base-ui/react/button", () => ({
  Button: (props: React.ComponentProps<"button">) => <button {...props} />,
}));

vi.mock("@base-ui/react/input", () => ({
  Input: (props: React.ComponentProps<"input">) => <input {...props} />,
}));

const dialogPrimitive = {
  Root: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Trigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Backdrop: (props: React.ComponentProps<"div">) => <div {...props} />,
  Popup: (props: React.ComponentProps<"div">) => <div {...props} />,
  Title: (props: React.ComponentProps<"h2">) => <h2 {...props} />,
  Description: (props: React.ComponentProps<"p">) => <p {...props} />,
  Close: ({
    children,
    render,
    ...props
  }: React.ComponentProps<"button"> & { render?: React.ReactElement }) =>
    render ? React.cloneElement(render, props, children) : <button {...props}>{children}</button>,
};

vi.mock("@base-ui/react/dialog", () => ({
  Dialog: dialogPrimitive,
}));

vi.mock("@copilotkit/runtime/v2", () => ({
  CopilotSseRuntime: class CopilotSseRuntime {
    config: unknown;
    constructor(config: unknown) {
      this.config = config;
    }
  },
  createCopilotRuntimeHandler: (config: {
    hooks?: { onRequest?: (event: { request: Request }) => Promise<void> };
  }) =>
    vi.fn(async (request: Request) => {
      await config.hooks?.onRequest?.({ request });
      return new Response("ok");
    }),
}));

vi.mock("@ag-ui/client", () => ({
  HttpAgent: class HttpAgent {
    config: unknown;
    constructor(config: unknown) {
      this.config = config;
    }
  },
}));

async function render(label: string, element: React.ReactElement) {
  try {
    expect(renderToStaticMarkup(element)).toEqual(expect.any(String));
  } catch (error) {
    // Redirect pages (e.g. /travel -> /console/travel) render by throwing a
    // NEXT_REDIRECT control-flow error; that is a valid outcome, not a failure.
    const digest = (error as { digest?: unknown })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      return;
    }
    throw new Error(`render failed: ${label}`, { cause: error });
  }
}

async function interact(label: string, element: React.ReactElement) {
  try {
    let tree: ReturnType<typeof create>;
    await act(async () => {
      tree = create(element);
    });
    const root = tree!.root;
    for (const button of root.findAllByType("button")) {
      if (typeof button.props.onClick === "function") {
        await act(async () => {
          await button.props.onClick();
        });
      }
    }
    for (const input of [...root.findAllByType("input"), ...root.findAllByType("textarea")]) {
      if (typeof input.props.onChange === "function") {
        await act(async () => {
          input.props.onChange({ target: { value: "Updated" } });
        });
      }
    }
    await act(async () => {
      tree!.unmount();
    });
  } catch (error) {
    const digest = (error as { digest?: unknown })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      return;
    }
    throw new Error(`interaction failed: ${label}`, { cause: error });
  }
}

describe("web all-source smoke coverage", () => {
  it("renders all pages and key component states", async () => {
    Object.defineProperty(globalThis, "crypto", {
      value: { randomUUID: () => "uuid" },
      configurable: true,
    });
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      value: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, "window", {
      value: {
        location: {
          href: "http://localhost",
          assign: vi.fn(),
        },
        localStorage: {
          getItem: vi.fn(() => "system"),
          setItem: vi.fn(),
        },
        matchMedia: vi.fn(() => ({
          matches: false,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      configurable: true,
    });
    Object.defineProperty(globalThis, "document", {
      value: {
        documentElement: {
          classList: { add: vi.fn(), remove: vi.fn() },
          style: {},
        },
      },
      configurable: true,
    });

    const [
      Home,
      Layout,
      SignInPage,
      SignUpPage,
      TravelPage,
      GroceryPage,
      FitnessPage,
      WellnessPage,
      OralBoardsPage,
      A2UIPage,
      SettingsPage,
      AgentCardModule,
      AgentStatusBarModule,
      ApprovalModule,
      DocumentModule,
      PreferencesModule,
      ProvidersModule,
      ThemeModule,
      DialogModule,
      CopilotRouteModule,
      ProxyModule,
    ] = await Promise.all([
      import("./app/page"),
      import("./app/layout"),
      import("./app/sign-in/[[...sign-in]]/page"),
      import("./app/sign-up/[[...sign-up]]/page"),
      import("./app/travel/page"),
      import("./app/grocery/page"),
      import("./app/fitness/page"),
      import("./app/wellness/page"),
      import("./app/oral-boards/page"),
      import("./app/a2ui/page"),
      import("./app/console/settings/page"),
      import("./components/agent-card"),
      import("./components/agent-status-bar"),
      import("./components/approval-dialog"),
      import("./components/document-canvas"),
      import("./components/preferences-panel"),
      import("@/components/providers"),
      import("@/components/theme-toggle"),
      import("@/components/ui/dialog"),
      import("./app/api/copilotkit/route"),
      import("./proxy"),
    ]);

    await render("layout", <Layout.default>body</Layout.default>);
    await render(
      "home",
      <ProvidersModule.Providers>
        <Home.default />
      </ProvidersModule.Providers>,
    );
    await render("sign-in", <SignInPage.default />);
    await render("sign-up", <SignUpPage.default />);
    await render(
      "travel",
      <ProvidersModule.Providers>
        <TravelPage.default />
      </ProvidersModule.Providers>,
    );
    await render(
      "grocery",
      <ProvidersModule.Providers>
        <GroceryPage.default />
      </ProvidersModule.Providers>,
    );
    await render(
      "fitness",
      <ProvidersModule.Providers>
        <FitnessPage.default />
      </ProvidersModule.Providers>,
    );
    await render(
      "wellness",
      <ProvidersModule.Providers>
        <WellnessPage.default />
      </ProvidersModule.Providers>,
    );
    await render(
      "oral-boards",
      <ProvidersModule.Providers>
        <OralBoardsPage.default />
      </ProvidersModule.Providers>,
    );
    await render(
      "a2ui",
      <ProvidersModule.Providers>
        <A2UIPage.default />
      </ProvidersModule.Providers>,
    );
    await render(
      "settings",
      <ProvidersModule.Providers>
        <SettingsPage.default />
      </ProvidersModule.Providers>,
    );
    await interact(
      "travel",
      <ProvidersModule.Providers>
        <TravelPage.default />
      </ProvidersModule.Providers>,
    );
    await interact(
      "grocery",
      <ProvidersModule.Providers>
        <GroceryPage.default />
      </ProvidersModule.Providers>,
    );
    await interact(
      "fitness",
      <ProvidersModule.Providers>
        <FitnessPage.default />
      </ProvidersModule.Providers>,
    );
    await interact(
      "wellness",
      <ProvidersModule.Providers>
        <WellnessPage.default />
      </ProvidersModule.Providers>,
    );
    agentStates.grocery = { kroger_connected: false, status: "idle" };
    agentStates.fitness = { strava_connected: false, status: "idle" };
    agentStates.wellness = {
      status: "idle",
      kroger_connected: false,
      strava_connected: false,
      weekly_plan: "",
      meal_plan: "",
      workout_plan: "",
    };
    await interact(
      "grocery-disconnected",
      <ProvidersModule.Providers>
        <GroceryPage.default />
      </ProvidersModule.Providers>,
    );
    await interact(
      "fitness-disconnected",
      <ProvidersModule.Providers>
        <FitnessPage.default />
      </ProvidersModule.Providers>,
    );
    await interact(
      "wellness-disconnected",
      <ProvidersModule.Providers>
        <WellnessPage.default />
      </ProvidersModule.Providers>,
    );
    await interact(
      "oral-boards",
      <ProvidersModule.Providers>
        <OralBoardsPage.default />
      </ProvidersModule.Providers>,
    );
    agentStates.grocery = {
      kroger_connected: true,
      status: "planning",
      shopping_list: [],
      cart: [],
      pantry: [],
      meal_plan: "",
      weekly_deals: "",
    };
    agentStates.fitness = {
      strava_connected: true,
      status: "planning",
      activities: [],
      objective_research: "",
      training_plan: "",
    };
    agentStates.wellness = {
      status: "planning",
      kroger_connected: true,
      strava_connected: true,
      weekly_plan: "",
      meal_plan: "",
      workout_plan: "",
    };
    await render(
      "grocery-empty",
      <ProvidersModule.Providers>
        <GroceryPage.default />
      </ProvidersModule.Providers>,
    );
    await render(
      "fitness-empty",
      <ProvidersModule.Providers>
        <FitnessPage.default />
      </ProvidersModule.Providers>,
    );
    await render(
      "wellness-empty",
      <ProvidersModule.Providers>
        <WellnessPage.default />
      </ProvidersModule.Providers>,
    );
    await render(
      "theme",
      <ProvidersModule.Providers>
        <ThemeModule.ThemeToggle />
      </ProvidersModule.Providers>,
    );
    await interact(
      "theme",
      <ProvidersModule.Providers>
        <ThemeModule.ThemeToggle />
      </ProvidersModule.Providers>,
    );

    const agent = {
      id: "travel",
      href: "/travel",
      name: "Travel",
      tagline: "Plan",
      description: "Trip planning",
      cta: "Open",
      tags: ["adk"],
      theme: "travel",
    } as const;
    await render(
      "agent-card-loading",
      <AgentCardModule.AgentCard agent={agent} index={0} status="loading" />,
    );
    await render(
      "agent-card-ok",
      <AgentCardModule.AgentCard agent={{ ...agent, theme: "wellness" }} index={1} status="ok" />,
    );
    await render(
      "agent-card-error",
      <AgentCardModule.AgentCard agent={{ ...agent, theme: "a2ui" }} index={2} status="error" />,
    );
    await render(
      "agent-status-bar",
      <AgentStatusBarModule.AgentStatusBar
        statuses={{ travel: "ok", grocery: "error", "oral-boards": "ok" }}
      />,
    );
    await render(
      "approval-card",
      <ApprovalModule.ApprovalCard
        request={{ id: "1", action: "Book", reason: "Fare hold", resolve: vi.fn() }}
      />,
    );
    await interact(
      "approval-card",
      <ApprovalModule.ApprovalCard
        request={{ id: "1", action: "Book", reason: "Fare hold", resolve: vi.fn() }}
      />,
    );
    await render(
      "approval-dialog",
      <ApprovalModule.ApprovalDialog
        request={{ id: "2", action: "Reserve", reason: "Deadline", resolve: vi.fn() }}
      />,
    );
    await interact(
      "approval-dialog",
      <ApprovalModule.ApprovalDialog
        request={{ id: "3", action: "Hold", reason: "", resolve: vi.fn() }}
      />,
    );
    await render(
      "dialog-components",
      <DialogModule.Dialog open>
        <DialogModule.DialogTrigger>Open</DialogModule.DialogTrigger>
        <DialogModule.DialogContent>
          <DialogModule.DialogHeader>
            <DialogModule.DialogTitle>Title</DialogModule.DialogTitle>
            <DialogModule.DialogDescription>Description</DialogModule.DialogDescription>
          </DialogModule.DialogHeader>
          <DialogModule.DialogFooter showCloseButton>Footer</DialogModule.DialogFooter>
        </DialogModule.DialogContent>
      </DialogModule.Dialog>,
    );
    await render(
      "document-canvas",
      <DocumentModule.DocumentCanvas
        destination="Kyoto"
        startDate="2026-10-01"
        endDate="2026-10-07"
        travelers={2}
        budgetUsd={4500}
        headline="Temples"
        summary="Summary"
        itinerary={"Intro\n## Day 1: Arrival\n- 09:00 - Land"}
        flights="UA 1"
        status="booked"
        isStreaming
        reviewSummary="Ready"
        onDestinationChange={vi.fn()}
        onHeadlineChange={vi.fn()}
        onItineraryChange={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    await interact(
      "document-canvas",
      <DocumentModule.DocumentCanvas
        destination="Kyoto"
        startDate="bad-date"
        endDate=""
        travelers={2}
        budgetUsd={4500}
        headline="Temples"
        summary="Summary"
        itinerary={"## Day 1: Arrival\n- Land\n## Day 2:"}
        flights=""
        status="drafting"
        isStreaming={false}
        onDestinationChange={vi.fn()}
        onHeadlineChange={vi.fn()}
        onItineraryChange={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    await render("preferences", <PreferencesModule.PreferencesPanel />);
    await interact("preferences", <PreferencesModule.PreferencesPanel />);

    const request = new Request("http://localhost/travel");
    await CopilotRouteModule.GET(request);
    await CopilotRouteModule.POST(request);
    await CopilotRouteModule.PATCH(request);
    await CopilotRouteModule.DELETE(request);
    await ProxyModule.default({ protect: vi.fn() } as never, request);
  });
});
