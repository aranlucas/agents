import Database from "better-sqlite3";
import path from "node:path";

const COLLECTION_LABELS: Record<string, string> = {
  abpd: "ABPD",
  aapd: "AAPD",
  cody: "Prep Course",
};

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

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    const dbPath = path.join(process.cwd(), "search.sqlite");
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
  }
  return db;
}

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
    AND d.active = 1
  ORDER BY bm25(documents_fts)
  LIMIT ?
`;

const GET_BY_ID_SQL = `
  SELECT d.id, d.collection, d.collection || '/' || d.path AS filepath, d.title
  FROM documents d
  WHERE d.id = ?
    AND d.active = 1
`;

const GET_BODY_SQL = `
  SELECT c.doc
  FROM documents d
  JOIN content c ON d.hash = c.hash
  WHERE d.collection || '/' || d.path = ?
    AND d.active = 1
`;

function cleanQuery(q: string) {
  return q.replace(/[*"]/g, " ").trim().replace(/\s+/g, " ");
}

function scoreBm25(score: number) {
  const abs = Math.abs(score);
  return abs / (1 + abs);
}

export function getStore() {
  const database = getDb();
  const ftsStmt = database.prepare(FTS_SQL);
  const getByIdStmt = database.prepare(GET_BY_ID_SQL);
  const getBodyStmt = database.prepare(GET_BODY_SQL);

  return {
    async searchLex(q: string, options: { limit?: number } = {}): Promise<SearchResult[]> {
      const limit = options.limit ?? 10;
      const escaped = cleanQuery(q);
      if (!escaped) return [];

      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const rows = ftsStmt.all(escaped, limit) as Array<{
        id: number;
        collection: string;
        filepath: string;
        title: string;
        body: string;
        score: number;
        snippet: string;
      }>;

      return rows.map((row) => ({
        docid: String(row.id),
        filepath: row.filepath,
        title: row.title,
        body: row.body,
        score: scoreBm25(row.score),
        snippet: row.snippet,
        collectionName: COLLECTION_LABELS[row.collection] ?? row.collection,
      }));
    },

    async get(docRef: string): Promise<DocMeta | { error: string }> {
      const id = docRef.startsWith("#") ? docRef.slice(1) : docRef;
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
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
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const row = getBodyStmt.get(filepath) as { doc: string } | undefined;
      return row?.doc ?? "";
    },
  };
}
