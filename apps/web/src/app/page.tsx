import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-3xl font-bold">Agents</h1>
      <p className="text-gray-500 text-center max-w-sm">
        AI-powered planning for travel and groceries.
      </p>
      <div className="flex gap-4">
        <Link
          href="/travel"
          className="px-6 py-3 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
        >
          Trip Planner
        </Link>
        <Link
          href="/grocery"
          className="px-6 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
        >
          Grocery Planner
        </Link>
      </div>
    </main>
  );
}
