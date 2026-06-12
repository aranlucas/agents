import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import type { FeatureExtractionPipeline } from "@xenova/transformers";
import path from "path";

const COLLECTION_LABELS: Record<string, string> = {
  abpd: "ABPD",
  aapd: "AAPD",
  cody: "Prep Course",
};

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";

export interface SearchResult {
  docid: string;
  filepath: string;
  title: string;
  score: number;
  snippet?: string;
  collectionName?: string;
  body?: string;
}

export interface DocMeta {
  docid: string;
  filepath: string;
  title: string;
  collectionName?: string;
}

// ── singletons ────────────────────────────────────────────────────────────────

let db: Database.Database | null = null;
let embedder: FeatureExtractionPipeline | null = null;
let hasVectors: boolean | null = null;

function getDb(): Database.Database {
  if (!db) {
    const conn = new Database(path.join(process.cwd(), "search.sqlite"), {
      readonly: false, // needs write for sqlite-vec
    });
    sqliteVec.load(conn);
    db = conn;
  }
  return db;
}

async function getEmbedder(): Promise<FeatureExtractionPipeline> {
  if (!embedder) {
    const { pipeline, env } = await import("@xenova/transformers");
    env.cacheDir = path.join(process.cwd(), "models");
    embedder = await pipeline("feature-extraction", MODEL_NAME, {
      quantized: false,
      local_files_only: true, // never download at runtime
    });
  }
  return embedder!;
}

function vectorsAvailable(database: Database.Database): boolean {
  if (hasVectors !== null) return hasVectors;
  const row = database
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='vectors_vec'`,
    )
    .get();
  const count = row
    ? (
        database.prepare("SELECT COUNT(*) AS n FROM content_vectors").get() as {
          n: number;
        }
      ).n
    : 0;
  hasVectors = count > 0;
  return hasVectors;
}

// ── SQL ───────────────────────────────────────────────────────────────────────

const FTS_SQL = `
  SELECT
    d.id,
    d.collection,
    fts.filepath,
    fts.title,
    fts.body,
    bm25(documents_fts) AS score,
    snippet(documents_fts, 2, '[[', ']]', '...', 32) AS snippet
  FROM documents_fts fts
  JOIN documents d ON fts.filepath = d.collection || '/' || d.path
  WHERE documents_fts MATCH ?
  ORDER BY bm25(documents_fts)
  LIMIT ?
`;

const VEC_SQL = `
  SELECT
    d.id,
    d.collection,
    d.collection || '/' || d.path AS filepath,
    d.title,
    c.doc AS body,
    v.distance
  FROM vectors_vec v
  JOIN content_vectors cv ON cv.hash || ':' || cv.seq = v.hash_seq
  JOIN documents d ON d.hash = cv.hash
  JOIN content c ON c.hash = cv.hash
  WHERE v.embedding MATCH ?
    AND k = ?
  ORDER BY v.distance
`;

const GET_BY_ID_SQL = `
  SELECT d.id, d.collection, d.collection || '/' || d.path AS filepath, d.title
  FROM documents d
  WHERE d.id = ?
`;

const GET_BODY_SQL = `
  SELECT c.doc
  FROM documents d
  JOIN content c ON d.hash = c.hash
  WHERE d.collection || '/' || d.path = ?
`;

// ── RRF merge ─────────────────────────────────────────────────────────────────

const RRF_K = 60;

function rrfMerge(
  ftsRows: Array<{
    id: number;
    collection: string;
    filepath: string;
    title: string;
    body: string;
    score: number;
    snippet: string;
  }>,
  vecRows: Array<{
    id: number;
    collection: string;
    filepath: string;
    title: string;
    body: string;
    distance: number;
  }>,
): SearchResult[] {
  // Map docid → accumulated RRF score
  const scores = new Map<
    number,
    {
      rrf: number;
      id: number;
      collection: string;
      filepath: string;
      title: string;
      body: string;
      snippet?: string;
    }
  >();

  ftsRows.forEach((r, rank) => {
    scores.set(r.id, {
      rrf: 1 / (RRF_K + rank + 1),
      id: r.id,
      collection: r.collection,
      filepath: r.filepath,
      title: r.title,
      body: r.body,
      snippet: r.snippet,
    });
  });

  vecRows.forEach((r, rank) => {
    const existing = scores.get(r.id);
    const rrfContrib = 1 / (RRF_K + rank + 1);
    if (existing) {
      existing.rrf += rrfContrib;
    } else {
      scores.set(r.id, {
        rrf: rrfContrib,
        id: r.id,
        collection: r.collection,
        filepath: r.filepath,
        title: r.title,
        body: r.body,
      });
    }
  });

  return Array.from(scores.values())
    .sort((a, b) => b.rrf - a.rrf)
    .map((r) => ({
      docid: String(r.id),
      filepath: r.filepath,
      title: r.title,
      body: r.body,
      score: r.rrf / (2 / (RRF_K + 1)), // normalise to ~[0,1]
      snippet: r.snippet,
      collectionName: COLLECTION_LABELS[r.collection] ?? r.collection,
    }));
}

// ── public API ────────────────────────────────────────────────────────────────

export function getStore() {
  const database = getDb();

  const ftsStmt = database.prepare(FTS_SQL);
  const getByIdStmt = database.prepare(GET_BY_ID_SQL);
  const getBodyStmt = database.prepare(GET_BODY_SQL);

  return {
    async searchLex(
      q: string,
      options: { limit?: number } = {},
    ): Promise<SearchResult[]> {
      const limit = options.limit ?? 10;
      const escaped = q.replace(/[*"]/g, " ").trim();
      if (!escaped) return [];

      const ftsRows = ftsStmt.all(escaped, limit) as Array<{
        id: number;
        collection: string;
        filepath: string;
        title: string;
        body: string;
        score: number;
        snippet: string;
      }>;

      // If no vector index, return BM25 results with normalised scores.
      if (!vectorsAvailable(database)) {
        return ftsRows.map((r) => ({
          docid: String(r.id),
          filepath: r.filepath,
          title: r.title,
          body: r.body,
          score: Math.abs(r.score) / (1 + Math.abs(r.score)),
          snippet: r.snippet,
          collectionName: COLLECTION_LABELS[r.collection] ?? r.collection,
        }));
      }

      // Hybrid: embed query then run vector search in parallel with BM25.
      // Falls back to BM25-only if the ONNX runtime is unavailable (e.g. Vercel).
      try {
        const embed = await getEmbedder();
        const out = await embed(q, { pooling: "mean", normalize: true });
        const queryVec = Buffer.from(new Float32Array(out.data as ArrayLike<number>).buffer);

        const vecStmt = database.prepare(VEC_SQL);
        const vecRows = vecStmt.all(queryVec, limit) as Array<{
          id: number;
          collection: string;
          filepath: string;
          title: string;
          body: string;
          distance: number;
        }>;

        return rrfMerge(ftsRows, vecRows).slice(0, limit);
      } catch {
        hasVectors = false; // disable vector path for subsequent requests
        return ftsRows.map((r) => ({
          docid: String(r.id),
          filepath: r.filepath,
          title: r.title,
          body: r.body,
          score: Math.abs(r.score) / (1 + Math.abs(r.score)),
          snippet: r.snippet,
          collectionName: COLLECTION_LABELS[r.collection] ?? r.collection,
        }));
      }
    },

    async get(docRef: string): Promise<DocMeta | { error: string }> {
      const id = docRef.startsWith("#") ? docRef.slice(1) : docRef;
      const row = getByIdStmt.get(Number(id)) as
        | { id: number; collection: string; filepath: string; title: string }
        | undefined;
      if (!row) return { error: "Not found" };
      return {
        docid: String(row.id),
        filepath: row.filepath,
        title: row.title,
        collectionName: COLLECTION_LABELS[row.collection] ?? row.collection,
      };
    },

    async getDocumentBody(filepath: string): Promise<string> {
      const row = getBodyStmt.get(filepath) as { doc: string } | undefined;
      return row?.doc ?? "";
    },
  };
}
