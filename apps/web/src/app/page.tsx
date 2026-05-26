import { AgentCard, type Agent } from "@/components/agent-card";

const AGENTS: Agent[] = [
  {
    id: "01",
    href: "/travel",
    name: "Trip Studio",
    tagline: "Real-time itinerary planning",
    description: "Co-plan an itinerary, stream day-by-day, and book with approval.",
    cta: "Plan trip",
    tags: ["Travel", "Approvals", "Streaming"],
    theme: "travel",
  },
  {
    id: "02",
    href: "/grocery",
    name: "Grocery Studio",
    tagline: "Meal plans to Kroger carts",
    description: "Plan meals, find weekly deals, and build a cart you can check out.",
    cta: "Plan groceries",
    tags: ["Meals", "Kroger", "Deals"],
    theme: "grocery",
  },
  {
    id: "03",
    href: "/fitness",
    name: "Fitness Studio",
    tagline: "Strava-aware weekly training",
    description: "Build weekly training from Strava history and mountain objectives.",
    cta: "Plan training",
    tags: ["Fitness", "Strava", "Recovery"],
    theme: "fitness",
  },
  {
    id: "04",
    href: "/wellness",
    name: "Wellness Studio",
    tagline: "Meals and workouts together",
    description: "Coordinate grocery and fitness agents into one practical weekly plan.",
    cta: "Plan week",
    tags: ["A2A", "Meals", "Training"],
    theme: "wellness",
  },
];

const AGENT_DOTS = [
  { label: "Travel",   color: "var(--travel)"   },
  { label: "Grocery",  color: "var(--grocery)"  },
  { label: "Fitness",  color: "var(--fitness)"  },
  { label: "Wellness", color: "var(--wellness)" },
];

export default function Home() {
  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center gap-14 px-6 py-20">
      {/* Atmospheric glow — decorative */}
      <div
        className="pointer-events-none fixed inset-0 overflow-hidden"
        aria-hidden
      >
        <div
          className="absolute -top-32 left-1/3 w-[560px] h-[560px] rounded-full blur-[130px] opacity-30"
          style={{ background: "var(--accent)" }}
        />
        <div
          className="absolute top-2/3 -right-24 w-[380px] h-[380px] rounded-full blur-[110px] opacity-15"
          style={{ background: "var(--grocery)" }}
        />
        <div
          className="absolute -bottom-24 left-1/4 w-[420px] h-[420px] rounded-full blur-[120px] opacity-10"
          style={{ background: "var(--travel)" }}
        />
      </div>

      {/* Hero */}
      <div className="hero-reveal relative text-center space-y-6 max-w-lg">
        {/* Status pill */}
        <div className="inline-flex items-center gap-2.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-1.5 shadow-sm">
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ backgroundColor: "var(--success)" }}
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-mute)]">
            4 agents live
          </span>
          <span className="text-[var(--border)] font-mono text-xs select-none">·</span>
          <span className="font-mono text-[10px] tracking-wide text-[var(--ink-mute)]">
            CopilotKit × ADK
          </span>
        </div>

        {/* Heading: mono label + serif italic display */}
        <div className="space-y-1">
          <p
            className="font-mono text-xs uppercase tracking-[0.3em] text-[var(--ink-mute)]"
          >
            Agents
          </p>
          <h1
            className="font-display italic text-5xl md:text-6xl text-[var(--ink)] leading-[1.1]"
          >
            Working together.
          </h1>
        </div>

        <p className="text-base text-[var(--ink-mute)] leading-relaxed max-w-sm mx-auto">
          Trip planning, grocery, and fitness — with agents that
          share context and talk to each other.
        </p>

        {/* Agent color identity row */}
        <div className="flex items-center justify-center gap-5 pt-1">
          {AGENT_DOTS.map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="font-mono text-[10px] text-[var(--ink-mute)]">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Agent grid */}
      <div className="relative w-full max-w-5xl grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {AGENTS.map((agent, index) => (
          <AgentCard key={agent.id} agent={agent} index={index} />
        ))}
      </div>

      {/* A2A footnote */}
      <p
        className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-mute)] text-center"
        style={{ animationDelay: "600ms" }}
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
          style={{ backgroundColor: "var(--grocery)" }}
        />
        Grocery
        <span className="mx-2 opacity-40">+</span>
        <span
          className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
          style={{ backgroundColor: "var(--fitness)" }}
        />
        Fitness
        <span className="mx-2 opacity-40">→</span>
        Wellness orchestration
      </p>
    </main>
  );
}
