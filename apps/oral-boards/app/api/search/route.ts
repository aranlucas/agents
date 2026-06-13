import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/searchStore";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ error: "Missing query parameter q" }, { status: 400 });
  }

  try {
    const store = getStore();
    const raw = await store.searchLex(q, { limit: 10 });
    const results = raw.map(({ body: _body, ...r }) => r);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("Search error:", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
