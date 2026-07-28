import Database from "better-sqlite3";
import path from "node:path";

const COLLECTION_LABELS: Record<string, string> = {
  abpd: "ABPD",
  aapd: "AAPD",
  cody: "Prep Course",
};
const MAX_SEARCH_QUERY_LENGTH = 256;
const MAX_SEARCH_TERMS = 16;
const MAX_SEARCH_TERM_LENGTH = 64;

export interface SearchResult {
  docid: string;
  filepath: string;
  title: string;
  score: number;
  snippet?: string;
  collectionName?: string;
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

export class InvalidSearchQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSearchQueryError";
  }
}

export function buildFtsQuery(query: string): string {
  const normalized = query.normalize("NFKC").trim();
  if (!normalized) {
    throw new InvalidSearchQueryError("Enter at least one search term");
  }
  if (normalized.length > MAX_SEARCH_QUERY_LENGTH) {
    throw new InvalidSearchQueryError(
      `Search queries must be ${MAX_SEARCH_QUERY_LENGTH} characters or fewer`,
    );
  }

  const terms = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (terms.length === 0) {
    throw new InvalidSearchQueryError("Enter at least one letter or number");
  }
  if (terms.length > MAX_SEARCH_TERMS) {
    throw new InvalidSearchQueryError(
      `Search queries can include at most ${MAX_SEARCH_TERMS} terms`,
    );
  }
  if (terms.some((term) => term.length > MAX_SEARCH_TERM_LENGTH)) {
    throw new InvalidSearchQueryError(
      `Each search term must be ${MAX_SEARCH_TERM_LENGTH} characters or fewer`,
    );
  }

  // Treat user input as literal tokens, never as FTS5 syntax. Quoted adjacent
  // phrases retain the existing implicit-AND behavior while punctuation such
  // as hyphens, parentheses, and question marks cannot become operators.
  return terms.map((term) => `"${term}"`).join(" ");
}

function scoreBm25(score: number) {
  const abs = Math.abs(score);
  return abs / (1 + abs);
}

type SearchStore = {
  searchLex(q: string, options?: { limit?: number }): Promise<SearchResult[]>;
  get(docRef: string): Promise<DocMeta | { error: string }>;
  getDocumentBody(filepath: string): Promise<string>;
};

let store: SearchStore | null = null;

export function getStore(): SearchStore {
  if (store) return store;

  const database = getDb();
  const ftsStmt = database.prepare(FTS_SQL);
  const getByIdStmt = database.prepare(GET_BY_ID_SQL);
  const getBodyStmt = database.prepare(GET_BODY_SQL);

  store = {
    async searchLex(q: string, options: { limit?: number } = {}): Promise<SearchResult[]> {
      const limit = Math.min(Math.max(Math.trunc(options.limit ?? 10), 1), 50);
      const escaped = buildFtsQuery(q);

      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const rows = ftsStmt.all(escaped, limit) as Array<{
        id: number;
        collection: string;
        filepath: string;
        title: string;
        score: number;
        snippet: string;
      }>;

      return rows.map((row) => ({
        docid: String(row.id),
        filepath: row.filepath,
        title: row.title,
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

  return store;
}
