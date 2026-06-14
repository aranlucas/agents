#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const check = process.argv.includes("--check");
const cssPath = "packages/ui/src/styles/globals.css";
const globs = ["*.{ts,tsx,js,jsx}", "*.css"];
const sourceFilePattern = /\.(?:ts|tsx|js|jsx|css)$/;

const utilityThemePreferences = {
  bg: {
    "--bg": "background",
    "--surface": "card",
    "--surface-soft": "secondary",
    "--bg-soft": "muted",
    "--accent": "primary",
    "--accent-soft": "accent",
    "--danger": "destructive",
  },
  text: {
    "--ink": "foreground",
    "--ink-mute": "muted-foreground",
    "--accent": "primary",
    "--accent-strong": "accent-foreground",
    "--danger": "destructive",
  },
  border: {
    "--border": "border",
    "--accent": "primary",
    "--danger": "destructive",
  },
  ring: {
    "--accent": "ring",
    "--border": "border",
  },
  from: {
    "--bg": "background",
    "--surface": "card",
    "--surface-soft": "secondary",
    "--accent": "primary",
    "--accent-soft": "accent",
  },
  to: {
    "--bg": "background",
    "--surface": "card",
    "--surface-soft": "secondary",
    "--accent": "primary",
    "--accent-soft": "accent",
  },
  via: {
    "--bg": "background",
    "--surface": "card",
    "--surface-soft": "secondary",
    "--accent": "primary",
    "--accent-soft": "accent",
  },
  fill: {
    "--ink": "foreground",
    "--accent": "primary",
    "--danger": "destructive",
  },
  stroke: {
    "--ink": "foreground",
    "--accent": "primary",
    "--danger": "destructive",
  },
  caret: {
    "--ink": "foreground",
    "--accent": "primary",
    "--danger": "destructive",
  },
  accent: {
    "--accent": "primary",
    "--accent-soft": "accent",
  },
};

function themeColorAliases() {
  const css = readFileSync(cssPath, "utf8");
  const match = css.match(/@theme\s+inline\s*\{(?<body>[\s\S]*?)\}/);
  if (!match?.groups?.body) {
    throw new Error(`Could not find @theme inline block in ${cssPath}`);
  }

  const aliases = new Map();
  const pattern = /--color-([a-z0-9-]+):\s*var\((--[a-z0-9-]+)\);/g;
  for (const [, name, token] of match.groups.body.matchAll(pattern)) {
    if (!aliases.has(token)) aliases.set(token, name);
  }
  return aliases;
}

const aliases = themeColorAliases();

function canonicalName(utility, token) {
  return utilityThemePreferences[utility]?.[token] ?? aliases.get(token);
}

function canonicalizeContent(source) {
  return source.replace(
    /(?<![A-Za-z0-9_-])((?:[a-z0-9-]+:)*(?:!)?)(bg|text|border|ring|from|to|via|fill|stroke|caret|accent)-\((--[A-Za-z0-9_-]+)\)(\/[0-9]+)?/g,
    (match, variants, utility, token, opacity = "") => {
      const name = canonicalName(utility, token);
      if (!name) return match;
      return `${variants}${utility}-${name}${opacity}`;
    },
  );
}

function repoFiles() {
  try {
    return execFileSync(
      "rg",
      ["--files", "apps", "packages", ...globs.flatMap((g) => ["--glob", g])],
      {
        encoding: "utf8",
      },
    )
      .trim()
      .split("\n")
      .filter(Boolean);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "apps", "packages"],
    {
      encoding: "utf8",
    },
  )
    .trim()
    .split("\n")
    .filter((file) => sourceFilePattern.test(file));
}

const changed = [];
for (const file of repoFiles()) {
  const source = readFileSync(file, "utf8");
  const next = canonicalizeContent(source);
  if (next === source) continue;
  changed.push(file);
  if (!check) writeFileSync(file, next);
}

if (changed.length > 0) {
  const label = check ? "Non-canonical Tailwind classes found" : "Canonicalized Tailwind classes";
  console.error(`${label}:`);
  for (const file of changed) console.error(`- ${relative(root, file)}`);
  process.exit(check ? 1 : 0);
}
