"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageLayout } from "@/components/PageLayout";
import { Navigation } from "@/components/Navigation";
import { PageHeader } from "@/components/PageHeader";
import { Search, FileText, Loader2, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

interface SearchResult {
  title: string;
  filepath: string;
  docid: string;
  score: number;
  snippet?: string;
  collectionName?: string;
}

const COLLECTION_LABELS: Record<string, string> = {
  abpd: "ABPD",
  aapd: "AAPD",
  cody: "Prep Course",
};

async function fetchSearch(q: string): Promise<SearchResult[]> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Search failed");
  const seen = new Set<string>();
  return (data.results ?? []).filter((r: SearchResult) => {
    if (seen.has(r.docid)) return false;
    seen.add(r.docid);
    return true;
  });
}

async function fetchDoc(docid: string): Promise<string> {
  const res = await fetch(`/api/doc/${docid}`);
  const data = await res.json();
  return data.doc?.body ?? "";
}

function highlightTerms(text: string, query: string): React.ReactNode {
  const terms = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (terms.length === 0) return text;
  const pattern = new RegExp(`(${terms.join("|")})`, "gi");
  const parts = text.split(pattern);
  const cls = "rounded-sm bg-yellow-200 px-0.5 text-gray-900 dark:bg-yellow-700 dark:text-gray-100";
  const keys = parts.map(() => crypto.randomUUID());
  return parts.map((part, i) =>
    pattern.test(part) ? (
      <mark key={keys[i]} className={cls}>
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function ResultCard({ result, query }: { result: SearchResult; query: string }) {
  const [expanded, setExpanded] = useState(false);

  const { data: body, isFetching } = useQuery({
    queryKey: ["doc", result.docid],
    queryFn: () => fetchDoc(result.docid),
    enabled: expanded,
    staleTime: Infinity,
  });

  const label = COLLECTION_LABELS[result.collectionName ?? ""] ?? result.collectionName;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white transition-colors hover:border-indigo-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-indigo-600">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {result.title}
            </span>
            {label && (
              <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                {label}
              </span>
            )}
          </div>
          <p className="truncate text-xs text-gray-400 dark:text-gray-600">{result.filepath}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-gray-400 tabular-nums">
            {Math.round(result.score * 100)}%
          </span>
          <Link
            href={`/doc/${result.docid}`}
            onClick={(e) => e.stopPropagation()}
            className="text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300"
            title="Open document"
          >
            <ExternalLink className="h-4 w-4" />
          </Link>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-800">
          {isFetching ? (
            <div className="flex items-center gap-2 py-2 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : (
            <pre className="max-h-96 overflow-y-auto font-sans text-xs leading-relaxed whitespace-pre-wrap text-gray-700 dark:text-gray-300">
              {body !== undefined ? highlightTerms(body, query) : null}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    data: results,
    isLoading,
    isFetching,
    error,
  } = useQuery({
    queryKey: ["search", query],
    queryFn: () => fetchSearch(query),
    enabled: query.trim().length > 0,
    staleTime: 1000 * 60 * 5,
    placeholderData: (prev) => prev,
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQuery(val), 350);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery(input);
  }

  const searched = query.trim().length > 0;

  return (
    <PageLayout
      footer={
        <p>Searches ABPD exam guides, AAPD clinical guidelines, and prep course materials.</p>
      }
    >
      <PageHeader
        title="Search Study Materials"
        subtitle="Full-text search across ABPD documents, AAPD guidelines, and prep course content"
      />

      <Navigation />

      <form onSubmit={handleSubmit} className="mb-6">
        <div className="relative mx-auto max-w-2xl">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            aria-label="Search study materials"
            value={input}
            onChange={handleChange}
            placeholder="e.g. pulp therapy, behavior guidance, trauma protocol..."
            className="w-full rounded-lg border border-gray-300 bg-white py-3 pr-4 pl-10 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900"
          />
          {isFetching && (
            <Loader2 className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin text-indigo-500" />
          )}
        </div>
      </form>

      {error && (
        <div className="mx-auto mb-4 max-w-2xl rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error instanceof Error ? error.message : "Search failed"}
        </div>
      )}

      {isLoading && (
        <div className="mx-auto max-w-2xl space-y-2">
          {Array.from({ length: 4 }, () => crypto.randomUUID()).map((id) => (
            <div
              key={id}
              className="animate-pulse rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
            >
              <div className="mb-2 h-4 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-3 w-1/3 rounded bg-gray-100 dark:bg-gray-800" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && searched && results?.length === 0 && (
        <div className="py-8 text-center text-gray-500">
          No results for{" "}
          <span className="font-medium text-gray-700 dark:text-gray-300">"{query}"</span>
        </div>
      )}

      {!isLoading && results && results.length > 0 && (
        <div className="mx-auto max-w-2xl space-y-2">
          {results.map((r) => (
            <ResultCard key={r.docid} result={r} query={query} />
          ))}
        </div>
      )}
    </PageLayout>
  );
}
