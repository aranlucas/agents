import Link from "next/link";

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
          Real-time, AI-powered planning for travel and groceries — co-plan
          with an agent that shares your canvas.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 w-full max-w-xl">
        <StudioCard
          href="/travel"
          title="Trip Studio"
          description="Co-plan an itinerary, stream day-by-day, book with approval."
          gradient="from-[var(--accent)] to-pink-500"
          icon={
            <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2Z" />
          }
        />
        <StudioCard
          href="/grocery"
          title="Grocery Studio"
          description="Plan meals, find deals, build a Kroger cart you can check out."
          gradient="from-[var(--accent)] to-emerald-500"
          icon={
            <>
              <circle cx="8" cy="21" r="1" />
              <circle cx="19" cy="21" r="1" />
              <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
            </>
          }
        />
      </div>
    </main>
  );
}

function StudioCard({
  href,
  title,
  description,
  gradient,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  gradient: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm hover:border-[var(--accent)] hover:shadow-md transition"
    >
      <div
        className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} shadow-md flex items-center justify-center mb-3`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5 text-white"
        >
          {icon}
        </svg>
      </div>
      <div className="flex items-center gap-1.5">
        <h2 className="font-semibold text-[var(--ink)]">{title}</h2>
        <span className="text-[var(--ink-mute)] group-hover:translate-x-0.5 transition-transform">
          →
        </span>
      </div>
      <p className="text-sm text-[var(--ink-mute)] mt-1">{description}</p>
    </Link>
  );
}
