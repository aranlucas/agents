export interface Day {
  day: number;
  theme: string;
  activities: string[];
}

export function parseItinerary(raw: string): {
  days: Day[];
  trailing: string;
} {
  if (!raw.trim()) return { days: [], trailing: "" };
  const lines = raw.split("\n");
  const days: Day[] = [];
  let current: Day | null = null;
  const preamble: string[] = [];

  const dayRe = /^##\s*Day\s+(\d+)\s*[:\-–—]\s*(.*)$/i;
  const bulletRe = /^\s*[-*•]\s*(.*)$/;

  for (const line of lines) {
    const dayMatch = line.match(dayRe);
    if (dayMatch) {
      if (current) days.push(current);
      current = {
        day: Number(dayMatch[1]),
        theme: dayMatch[2].trim(),
        activities: [],
      };
      continue;
    }
    if (current) {
      const b = line.match(bulletRe);
      if (b) {
        current.activities.push(b[1].trim());
      } else if (line.trim()) {
        current.activities.push(line.trim());
      }
    } else if (line.trim()) {
      preamble.push(line.trim());
    }
  }
  if (current) days.push(current);
  return { days, trailing: preamble.join(" ") };
}

export function fmtDate(s: string): string {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function fmtDateRange(start: string, end: string): string {
  if (!start && !end) return "";
  const a = fmtDate(start);
  const b = fmtDate(end);
  if (a && b) return `${a} → ${b}`;
  return a || b;
}

export function daysBetween(start: string, end: string): number {
  if (!start || !end) return 0;
  const a = new Date(start);
  const b = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000);
  return diff >= 0 ? diff + 1 : 0;
}
