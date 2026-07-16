import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const appDirectory = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const repositoryDirectory = path.resolve(appDirectory, "../..");
const environmentPath = path.join(appDirectory, ".env.production.local");
const [command, version] = process.argv.slice(2);

if (
  !new Set(["build", "publish"]).has(command) ||
  !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/u.test(version ?? "")
) {
  fail(
    "Usage: pnpm build:production-apk:android -- <version> or pnpm publish:production-apk:android -- <version>",
  );
}

const tag = `grocery-v${version}`;
const artifactsDirectory = path.join(appDirectory, "dist");
const apkPath = path.join(artifactsDirectory, `grocery-agent-${version}.apk`);
const checksumPath = `${apkPath}.sha256`;

if (command === "build") {
  build();
} else {
  publish();
}

function build() {
  if (!existsSync(environmentPath)) {
    fail(`Missing ${environmentPath}. Copy .env.example and fill in the production values.`);
  }

  loadEnvFile(environmentPath);
  validateProductionEnvironment();
  mkdirSync(artifactsDirectory, { recursive: true });

  run(
    "pnpm",
    [
      "dlx",
      "eas-cli@21.0.0",
      "build",
      "--platform",
      "android",
      "--profile",
      "production-apk",
      "--local",
      "--output",
      apkPath,
    ],
    { cwd: appDirectory, env: process.env },
  );

  writeChecksum();
  console.log(`\nBuilt ${apkPath}`);
  console.log(`Install and verify it with: adb install -r ${JSON.stringify(apkPath)}`);
  console.log(`After QA, publish it with: pnpm publish:production-apk:android -- ${version}`);
}

function publish() {
  if (!existsSync(apkPath)) fail(`Missing ${apkPath}. Build and test the APK before publishing.`);
  requireCommand("gh");
  requireCleanPushedCommit();
  writeChecksum();

  const tagExists = runForOutput("git", ["tag", "--list", tag], repositoryDirectory) === tag;
  if (!tagExists) {
    run("git", ["tag", "--annotate", tag, "--message", `Grocery Agent ${version}`], {
      cwd: repositoryDirectory,
    });
  }
  run("git", ["push", "origin", tag], { cwd: repositoryDirectory });

  const releaseExists =
    spawnSync("gh", ["release", "view", tag], {
      cwd: repositoryDirectory,
      stdio: "ignore",
    }).status === 0;

  if (releaseExists) {
    run("gh", ["release", "upload", tag, apkPath, checksumPath, "--clobber"], {
      cwd: repositoryDirectory,
    });
  } else {
    run(
      "gh",
      [
        "release",
        "create",
        tag,
        apkPath,
        checksumPath,
        "--verify-tag",
        "--generate-notes",
        "--title",
        `Grocery Agent ${version}`,
      ],
      { cwd: repositoryDirectory },
    );
  }
}

function validateProductionEnvironment() {
  const clerkKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  if (!clerkKey.startsWith("pk_live_")) {
    fail("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY must be a production pk_live_ key.");
  }

  for (const name of ["EXPO_PUBLIC_COPILOTKIT_RUNTIME_URL", "EXPO_PUBLIC_GROCERY_MARKETING_URL"]) {
    const value = process.env[name] ?? "";
    if (!value.startsWith("https://")) fail(`${name} must be an HTTPS production URL.`);
    if (/development|localhost|127\.0\.0\.1/iu.test(value)) {
      fail(`${name} points to a development or local environment.`);
    }
  }
}

function requireCleanPushedCommit() {
  const status = runForOutput("git", ["status", "--porcelain"], repositoryDirectory);
  if (status) fail("Commit or stash repository changes before publishing a release.");

  const upstream = runForOutput(
    "git",
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    repositoryDirectory,
  );
  const result = spawnSync("git", ["merge-base", "--is-ancestor", "HEAD", upstream], {
    cwd: repositoryDirectory,
    stdio: "ignore",
  });
  if (result.status !== 0) fail(`Push the current commit to ${upstream} before publishing.`);
}

function writeChecksum() {
  const checksum = createHash("sha256").update(readFileSync(apkPath)).digest("hex");
  writeFileSync(checksumPath, `${checksum}  ${path.basename(apkPath)}\n`);
}

function requireCommand(name) {
  const result = spawnSync(name, ["--version"], { stdio: "ignore" });
  if (result.status !== 0) fail(`${name} is required but was not found on PATH.`);
}

function run(commandName, arguments_, options) {
  const result = spawnSync(commandName, arguments_, { ...options, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function runForOutput(commandName, arguments_, cwd) {
  return execFileSync(commandName, arguments_, { cwd, encoding: "utf8" }).trim();
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
