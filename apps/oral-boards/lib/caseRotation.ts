import { cases } from "@/data/cases";
import { Case } from "@/types/case";

export function getCaseOfDay(date: Date = new Date()): Case {
  // Use the day of year to cycle through cases
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const diff = date.getTime() - startOfYear.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));

  // Cycle through cases based on day of year
  const caseIndex = dayOfYear % cases.length;
  return cases[caseIndex];
}

export function getAllCases(): Case[] {
  return cases;
}
