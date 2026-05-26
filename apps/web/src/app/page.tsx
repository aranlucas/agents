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
    description:
      "Build weekly training from Strava history and mountain objectives.",
    cta: "Plan training",
    tags: ["Fitness", "Strava", "Recovery"],
    theme: "fitness",
  },
  {
    id: "04",
    href: "/wellness",
    name: "Wellness Studio",
    tagline: "Meals and workouts together",
    description:
      "Coordinate grocery and fitness agents into one practical weekly plan.",
    cta: "Plan week",
    tags: ["A2A", "Meals", "Training"],
    theme: "wellness",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-10 p-8">
      <div className="text-center space-y-3">
        <span className="inline-block text-[10px] font-mono tracking-wider uppercase text-[var(--ink-mute)] bg-[var(--bg-soft)] px-2.5 py-1 rounded-md border border-[var(--border)]">
          CopilotKit × ADK
        </span>
        <h1 className="text-4xl font-bold tracking-tight text-[var(--ink)]">
          Agents
        </h1>
        <p className="text-[var(--ink-mute)] max-w-sm">
          Real-time, AI-powered planning for travel, groceries, and training — co-plan
          with an agent that shares your canvas.
        </p>
      </div>

      <div className="grid w-full max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {AGENTS.map((agent, index) => (
          <AgentCard key={agent.id} agent={agent} index={index} />
        ))}
      </div>
    </main>
  );
}
