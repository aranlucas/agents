const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/u;
type FenceState = { character: string; length: number };

function fenceOpen(line: string): FenceState | null {
  const match = FENCE_OPEN.exec(line);
  if (!match) return null;
  const marker = match[1] ?? "";
  const character = marker[0] ?? "`";
  if (character === "`" && match[2]?.includes("`")) return null;
  return { character, length: marker.length };
}

function fenceClose(line: string, fence: FenceState): boolean {
  const match = /^ {0,3}(`{3,}|~{3,})[\t ]*$/u.exec(line);
  if (!match) return false;
  const marker = match[1] ?? "";
  return marker[0] === fence.character && marker.length >= fence.length;
}

function isBlank(line: string): boolean {
  return /^[\t ]*$/u.test(line);
}

/**
 * Splits markdown into top-level blocks such that rendering each block in
 * isolation matches rendering the whole document. Splits happen only at blank
 * lines that sit outside fenced code blocks and are followed by an unindented
 * line, so fences with interior blank lines and indented list/paragraph
 * continuations stay in one block. Ordered lists may split between items; the
 * renderer preserves numbering via the list's `start` attribute.
 */
export function splitMarkdownBlocks(markdown: string): string[] {
  const lines = markdown.replace(/\r\n?/gu, "\n").split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let pendingBlank: string[] = [];
  let fence: FenceState | null = null;

  const commit = () => {
    if (current.length > 0) blocks.push(current.join("\n"));
    current = [];
    pendingBlank = [];
  };

  for (const line of lines) {
    if (fence) {
      current.push(line);
      if (fenceClose(line, fence)) fence = null;
      continue;
    }
    if (isBlank(line)) {
      if (current.length > 0) pendingBlank.push(line);
      continue;
    }
    const startsUnindented = !/^[\t ]/u.test(line);
    if (pendingBlank.length > 0) {
      if (startsUnindented) commit();
      else {
        current.push(...pendingBlank);
        pendingBlank = [];
      }
    }
    current.push(line);
    fence = fenceOpen(line);
  }
  commit();
  return blocks;
}

/**
 * Truncates markdown to its first `maxBlocks` top-level blocks without
 * corrupting fenced code blocks or list continuations.
 */
export function limitMarkdownBlocks(markdown: string, maxBlocks?: number): string {
  if (!maxBlocks || maxBlocks < 1) return markdown;
  return splitMarkdownBlocks(markdown.trim()).slice(0, maxBlocks).join("\n\n");
}
