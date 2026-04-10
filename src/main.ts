import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { categoriseChanges, shouldSkipGeneration } from "./detect-changes.js";
import { buildContextPayload, isFirstRun, type RepoFile } from "./assemble-context.js";
import { generateDocs, type HumanDocType } from "./generate-docs.js";

function getEnv(name: string, required: boolean = true): string {
  const value = process.env[name];
  if (required && !value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value ?? "";
}

function getChangedFiles(): string[] {
  const output = execSync("git diff --name-only HEAD~1..HEAD", { encoding: "utf-8" });
  return output.trim().split("\n").filter(Boolean);
}

function readFile(path: string): string | null {
  try {
    return readFileSync(resolve(process.cwd(), path), "utf-8");
  } catch {
    return null;
  }
}

function readRepoFile(path: string): RepoFile | null {
  const content = readFile(path);
  if (content === null) return null;
  return { path, content };
}

function findFiles(pattern: string): string[] {
  try {
    const output = execSync(`find . -name "${pattern}" -not -path "*/bin/*" -not -path "*/obj/*" -not -path "*/node_modules/*"`, { encoding: "utf-8" });
    return output.trim().split("\n").filter(Boolean).map((f) => f.replace(/^\.\//, ""));
  } catch {
    return [];
  }
}

function loadIgnorePatterns(): string[] {
  const defaults = [".gitignore", ".github/**", "package-lock.json", "*.lock"];
  const docgenignorePath = resolve(process.cwd(), ".docgenignore");
  if (existsSync(docgenignorePath)) {
    const custom = readFileSync(docgenignorePath, "utf-8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    return [...defaults, ...custom];
  }
  return defaults;
}

async function main() {
  const apiKey = getEnv("INPUT_ANTHROPIC_API_KEY");
  const githubToken = getEnv("INPUT_GITHUB_TOKEN");
  const docsRepo = getEnv("INPUT_DOCS_REPO");
  const repoName = getEnv("INPUT_REPO_NAME");
  const model = getEnv("INPUT_CLAUDE_MODEL", false) || "claude-sonnet-4-6";
  const humanDocTypesStr = getEnv("INPUT_HUMAN_DOC_TYPES", false) || "api,architecture,onboarding";
  const claudeMdPath = getEnv("INPUT_CLAUDE_MD_PATH", false) || "CLAUDE.md";
  const claudeMdVerbosePath = getEnv("INPUT_CLAUDE_MD_VERBOSE_PATH", false) || "CLAUDE-VERBOSE.md";

  const humanDocTypes = humanDocTypesStr.split(",").map((s) => s.trim()) as HumanDocType[];

  console.log(`::group::Detecting changes`);
  const changedFiles = getChangedFiles();
  const ignorePatterns = loadIgnorePatterns();

  if (shouldSkipGeneration(changedFiles, ignorePatterns)) {
    console.log("Only ignored files changed — skipping doc generation.");
    console.log("::endgroup::");
    return;
  }

  const categories = categoriseChanges(changedFiles);
  console.log(`Source changes: ${Object.keys(categories.sourceChanges).join(", ") || "none"}`);
  console.log(`Test changes: ${Object.keys(categories.testChanges).join(", ") || "none"}`);
  console.log(`Root changes: ${categories.rootChanges.join(", ") || "none"}`);
  console.log("::endgroup::");

  console.log(`::group::Assembling context`);
  const existingClaudeMd = readFile(claudeMdPath);
  const firstRun = isFirstRun(existingClaudeMd);
  console.log(`Mode: ${firstRun ? "first run (full codebase)" : "incremental (diff-based)"}`);

  const structuralFiles: RepoFile[] = [
    ...findFiles("*.slnx").map((f) => readRepoFile(f)),
    ...findFiles("*.sln").map((f) => readRepoFile(f)),
    ...findFiles("*.csproj").map((f) => readRepoFile(f)),
  ].filter((f): f is RepoFile => f !== null);

  const existingDocs: RepoFile[] = [
    readRepoFile(claudeMdPath),
    readRepoFile(claudeMdVerbosePath),
    readRepoFile("README.md"),
  ].filter((f): f is RepoFile => f !== null);

  let diff = "";
  let changedFileContents: RepoFile[] = [];
  let allSourceFiles: RepoFile[] = [];

  if (firstRun) {
    const sourceFiles = findFiles("*.cs").filter((f) => f.startsWith("src/"));
    allSourceFiles = sourceFiles.map((f) => readRepoFile(f)).filter((f): f is RepoFile => f !== null);
    console.log(`Loaded ${allSourceFiles.length} source files for full analysis`);
  } else {
    diff = execSync("git diff HEAD~1..HEAD", { encoding: "utf-8" });
    changedFileContents = changedFiles
      .map((f) => readRepoFile(f))
      .filter((f): f is RepoFile => f !== null);
    console.log(`Loaded ${changedFileContents.length} changed files`);
  }

  const payload = buildContextPayload({
    isFirstRun: firstRun,
    structuralFiles,
    existingDocs,
    diff,
    changedFiles: changedFileContents,
    allSourceFiles,
  });
  console.log(`Context sections: ${payload.sections.map((s) => s.label).join(", ")}`);
  console.log("::endgroup::");

  console.log(`::group::Generating documentation`);
  const client = new Anthropic({ apiKey });

  const result = await generateDocs({
    client,
    model,
    payload,
    humanDocTypes,
    maxTokensPerChunk: 150_000,
  });

  console.log(`Token usage — input: ${result.tokenUsage.totalInput}, output: ${result.tokenUsage.totalOutput}`);
  console.log("::endgroup::");

  console.log(`::group::Writing AI docs`);
  writeFileSync(resolve(process.cwd(), claudeMdPath), result.claudeMd);
  writeFileSync(resolve(process.cwd(), claudeMdVerbosePath), result.claudeMdVerbose);
  console.log(`Written: ${claudeMdPath}, ${claudeMdVerbosePath}`);
  console.log("::endgroup::");

  console.log(`::group::Committing AI docs`);
  execSync(`git config user.name "doc-gen-action"`, { stdio: "inherit" });
  execSync(`git config user.email "doc-gen-action@brightsg.com"`, { stdio: "inherit" });
  execSync(`git add "${claudeMdPath}" "${claudeMdVerbosePath}"`, { stdio: "inherit" });

  const hasChanges = execSync("git diff --cached --name-only", { encoding: "utf-8" }).trim();
  if (hasChanges) {
    execSync(`git commit -m "docs(auto): update AI documentation [skip ci]"`, { stdio: "inherit" });
    execSync("git push", { stdio: "inherit" });
    console.log("AI docs committed and pushed.");
  } else {
    console.log("No changes to AI docs — skipping commit.");
  }
  console.log("::endgroup::");

  console.log(`::group::Dispatching human docs`);
  const docsPayload = JSON.stringify({
    event_type: "docs-update",
    client_payload: {
      repo: repoName,
      docs: result.humanDocs,
    },
  });

  try {
    execSync(
      `curl -s -X POST -H "Authorization: token ${githubToken}" -H "Accept: application/vnd.github.v3+json" https://api.github.com/repos/${docsRepo}/dispatches -d '${docsPayload.replace(/'/g, "'\\''")}'`,
      { stdio: "inherit" }
    );
    console.log(`Dispatched docs to ${docsRepo}`);
  } catch (error) {
    console.log(`::warning::Failed to dispatch to ${docsRepo}: ${error}`);
  }
  console.log("::endgroup::");

  console.log(`::notice::Documentation generation complete. Tokens used: ${result.tokenUsage.totalInput + result.tokenUsage.totalOutput}`);
}

main().catch((error) => {
  console.error(`::error::${error.message}`);
  process.exit(1);
});
