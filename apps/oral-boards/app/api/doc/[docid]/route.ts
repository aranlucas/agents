import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/search-store";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ docid: string }> },
) {
  const { docid } = await params;

  try {
    const store = getStore();
    const meta = await store.get(`#${docid}`);
    if ("error" in meta) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const body = await store.getDocumentBody(meta.filepath);
    return NextResponse.json({ doc: { ...meta, body } });
  } catch (err) {
    console.error("Doc fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch document" }, { status: 500 });
  }
}
