import { AgentList } from "@/components/agent-list";
import { AgentKey } from "@/components/agent-key";
import { AppHeader } from "@/components/app-header";
import { Badge } from "@agents/ui";
import type { Agent } from "@/components/agent-card";

const AGENTS: Agent[] = [
  {
    id: "01",
    href: "/console/travel",
    name: "Trip Studio",
    tagline: "Real-time itinerary planning",
    description: "Co-plan an itinerary, stream day-by-day, and book with approval.",
    cta: "Plan trip",
    tags: ["Travel", "Approvals", "Streaming"],
    theme: "travel",
  },
  {
    id: "02",
    href: "/console/grocery",
    name: "Grocery Studio",
    tagline: "Meal plans to Kroger carts",
    description: "Plan meals, find weekly deals, and build a cart you can check out.",
    cta: "Plan groceries",
    tags: ["Meals", "Kroger", "Deals"],
    theme: "grocery",
  },
  {
    id: "03",
    href: "/console/fitness",
    name: "Fitness Studio",
    tagline: "Strava-aware weekly training",
    description: "Build weekly training from Strava history and mountain objectives.",
    cta: "Plan training",
    tags: ["Fitness", "Strava", "Recovery"],
    theme: "fitness",
  },
  {
    id: "04",
    href: "/console/wellness",
    name: "Wellness Studio",
    tagline: "Meals and workouts together",
    description: "Coordinate grocery and fitness agents into one practical weekly plan.",
    cta: "Plan week",
    tags: ["In-process", "Meals", "Training"],
    theme: "wellness",
  },
  {
    id: "05",
    href: "/console/oral-boards",
    name: "Oral Boards",
    tagline: "Cited pediatric dentistry exams",
    description: "Practice staged ABPD-style cases grounded in bundled source documents.",
    cta: "Start exam",
    tags: ["OCE", "Citations", "Scoring"],
    theme: "oral-boards",
  },
  {
    id: "06",
    href: "/console/resume",
    name: "Resume",
    tagline: "Public Q&A for Lucas",
    description: "Ask about Lucas's background, skills, projects, and fit.",
    cta: "Ask resume",
    tags: ["Public", "Career", "Q&A"],
    theme: "resume",
  },
  {
    id: "07",
    href: "/console/a2ui",
    name: "A2UI Studio",
    tagline: "Generative UI over AG-UI",
    description: "Ask an ADK agent to render declarative A2UI surfaces through CopilotKit.",
    cta: "Render UI",
    tags: ["A2UI", "ADK", "AG-UI"],
    theme: "a2ui",
  },
];

export default function Home() {
  return (
    <div className="bg-background min-h-screen">
      <AppHeader />

      <main className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-370 flex-col gap-5 px-4 py-5 md:px-8 md:py-7">
        <section className="border-border grid gap-5 border-b pb-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="bg-card font-mono">
                Planning system
              </Badge>
              <Badge variant="secondary">CopilotKit x ADK</Badge>
            </div>
            <h1 className="text-foreground max-w-3xl text-4xl leading-[0.98] font-semibold tracking-tight md:text-6xl">
              Agents that coordinate useful work.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-(--ink-soft) md:text-base">
              A compact control surface for travel, grocery, fitness, wellness, and generative UI
              agents. Pick a workspace, give direction in chat, and watch the live artifact update.
            </p>
          </div>
          <AgentKey />
        </section>

        <AgentList agents={AGENTS} />

        <footer className="border-border mt-auto flex flex-wrap items-center gap-2 border-t pt-4">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-(--grocery)" />
          <span className="text-muted-foreground font-mono text-[10px] tracking-[0.14em] uppercase">
            Grocery
          </span>
          <span className="text-muted-foreground font-mono text-[10px] select-none">+</span>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-(--fitness)" />
          <span className="text-muted-foreground font-mono text-[10px] tracking-[0.14em] uppercase">
            Fitness
          </span>
          <span className="text-muted-foreground font-mono text-[10px] select-none">to</span>
          <span className="font-mono text-[10px] tracking-[0.14em] text-(--ink-soft) uppercase">
            Wellness orchestration
          </span>
        </footer>
      </main>
    </div>
  );
}
