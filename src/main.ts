import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { categoriseChanges, shouldSkipGeneration } from "./detect-changes.js";
import { buildContextPayload, isFirstRun, type RepoFile } from "./assemble-context.js";
import { generateDocs, loadPrompt, type HumanDocType } from "./generate-docs.js";
import { callClaudeWithChunks } from "./chunk-and-call.js";
import { resolveDocTypes } from "./resolve-doc-types.js";
import type { ContextSection } from "./assemble-context.js";

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

interface GitHistoryResult {
  content: string;
  tag: string | null;
}

function assembleGitHistory(): GitHistoryResult {
  let base = "HEAD~1";
  let tag: string | null = null;

  try {
    const tags = execSync("git tag --sort=-version:refname", { encoding: "utf-8" }).trim();
    if (tags) {
      const latestTag = tags.split("\n")[0];
      base = latestTag;
      tag = latestTag;
      console.log(`Release notes: tag-aware mode, generating since ${latestTag}`);
    }
  } catch {
    // No tags or git error — fall back to HEAD~1
  }

  if (!tag) {
    console.log("Release notes: per-push mode, generating for latest commit(s)");
  }

  let log: string;
  try {
    log = execSync(`git log ${base}..HEAD --format="- %s (%h)" --no-merges`, { encoding: "utf-8" }).trim();
  } catch {
    log = "";
  }

  if (!log) {
    return { content: "", tag };
  }

  let diffStat: string;
  try {
    diffStat = execSync(`git diff --stat ${base}..HEAD`, { encoding: "utf-8" }).trim();
  } catch {
    diffStat = "";
  }

  const parts = [
    `## Commits since ${tag || "last push"}`,
    "",
    log,
  ];

  if (diffStat) {
    parts.push("", "## Files Changed", "", diffStat);
  }

  return { content: parts.join("\n"), tag };
}

async function main() {
  const apiKey = getEnv("INPUT_ANTHROPIC_API_KEY");
  const githubToken = getEnv("INPUT_GITHUB_TOKEN");
  const docsRepo = getEnv("INPUT_DOCS_REPO");
  const repoName = getEnv("INPUT_REPO_NAME");
  const model = getEnv("INPUT_CLAUDE_MODEL", false) || "claude-sonnet-4-6";
  const humanDocTypesOverride = getEnv("INPUT_HUMAN_DOC_TYPES", false);
  const projectType = getEnv("INPUT_PROJECT_TYPE", false);
  const claudeMdPath = getEnv("INPUT_CLAUDE_MD_PATH", false) || "CLAUDE.md";
  const claudeMdVerbosePath = getEnv("INPUT_CLAUDE_MD_VERBOSE_PATH", false) || "CLAUDE-VERBOSE.md";

  let humanDocTypes: HumanDocType[];
  if (humanDocTypesOverride) {
    console.log(`Using explicit human-doc-types override: ${humanDocTypesOverride}`);
    humanDocTypes = humanDocTypesOverride.split(",").map((s) => s.trim()) as HumanDocType[];
  } else if (projectType) {
    console.log(`Resolving doc types from project-type: ${projectType}`);
    humanDocTypes = resolveDocTypes(projectType);
    console.log(`Resolved doc types: ${humanDocTypes.join(", ")}`);
  } else {
    throw new Error(
      "Either project-type or human-doc-types must be provided. " +
      "Set project-type to one of: api, worker, sdk, frontend, cli"
    );
  }
  const forceGenerate = getEnv("INPUT_FORCE_GENERATE", false) === "true";

  let forceFullGeneration = false;
  let changedFiles: string[] = [];

  if (forceGenerate) {
    console.log(`::group::Detecting changes`);
    console.log("Force generation enabled — skipping change detection, running full codebase analysis.");
    forceFullGeneration = true;
    console.log("::endgroup::");
  } else {
    console.log(`::group::Detecting changes`);
    changedFiles = getChangedFiles();
    const ignorePatterns = loadIgnorePatterns();

    const existingClaudeMdForCheck = readFile(claudeMdPath);
    const firstRunCheck = isFirstRun(existingClaudeMdForCheck);

    if (firstRunCheck) {
      console.log("No existing generated docs found — forcing full codebase generation.");
      forceFullGeneration = true;
    } else if (shouldSkipGeneration(changedFiles, ignorePatterns)) {
      console.log("Only ignored files changed — skipping doc generation.");
      console.log("::endgroup::");
      return;
    }

    const categories = categoriseChanges(changedFiles);
    console.log(`Source changes: ${Object.keys(categories.sourceChanges).join(", ") || "none"}`);
    console.log(`Test changes: ${Object.keys(categories.testChanges).join(", ") || "none"}`);
    console.log(`Root changes: ${categories.rootChanges.join(", ") || "none"}`);
    console.log("::endgroup::");
  }

  console.log(`::group::Assembling context`);
  const existingClaudeMd = readFile(claudeMdPath);
  const firstRun = forceFullGeneration || isFirstRun(existingClaudeMd);
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

  const sourceDocTypes = humanDocTypes.filter((t) => t !== "release-notes");
  const needsReleaseNotes = humanDocTypes.includes("release-notes");

  const result = await generateDocs({
    client,
    model,
    payload,
    humanDocTypes: sourceDocTypes,
    maxTokensPerChunk: 150_000,
  });

  if (needsReleaseNotes) {
    const gitHistory = assembleGitHistory();
    if (gitHistory.content) {
      const releaseNotesChunks: ContextSection[][] = [
        [{ label: "Git History", content: gitHistory.content }],
      ];
      const releaseNotesResult = await callClaudeWithChunks({
        client,
        model,
        systemPrompt: loadPrompt("release-notes-docs"),
        chunks: releaseNotesChunks,
        stitchPrompt: "",
      });
      result.humanDocs["release-notes"] = releaseNotesResult.text;
      result.tokenUsage.totalInput += releaseNotesResult.totalInputTokens;
      result.tokenUsage.totalOutput += releaseNotesResult.totalOutputTokens;
      console.log("Release notes generated successfully");
    } else {
      console.log("No new commits — skipping release notes generation");
    }
  }

  console.log(`Token usage — input: ${result.tokenUsage.totalInput}, output: ${result.tokenUsage.totalOutput}`);
  console.log("::endgroup::");

  console.log(`::group::Writing AI docs`);
  writeFileSync(resolve(process.cwd(), claudeMdPath), result.claudeMd);
  writeFileSync(resolve(process.cwd(), claudeMdVerbosePath), result.claudeMdVerbose);
  console.log(`Written: ${claudeMdPath}, ${claudeMdVerbosePath}`);
  console.log("::endgroup::");

  console.log(`::group::Creating PR for AI docs`);
  execSync(`git config user.name "doc-gen-action"`, { stdio: "inherit" });
  execSync(`git config user.email "doc-gen-action@brightsg.com"`, { stdio: "inherit" });
  execSync(`git add "${claudeMdPath}" "${claudeMdVerbosePath}"`, { stdio: "inherit" });

  const hasChanges = execSync("git diff --cached --name-only", { encoding: "utf-8" }).trim();
  if (hasChanges) {
    const branchName = `docs/auto-update-${Date.now()}`;
    execSync(`git checkout -b "${branchName}"`, { stdio: "inherit" });
    execSync(`git commit -m "docs(auto): update AI documentation"`, { stdio: "inherit" });
    execSync(`git push origin "${branchName}"`, { stdio: "inherit" });

    // Detect the consuming repo from git remote
    const remoteUrl = execSync("git remote get-url origin", { encoding: "utf-8" }).trim();
    const repoMatch = remoteUrl.match(/github\.com\/(.+?)(?:\.git)?$/);
    const consumingRepo = repoMatch ? repoMatch[1] : process.env.GITHUB_REPOSITORY || "";
    console.log(`Creating PR on: ${consumingRepo}`);

    // Create PR via GitHub API
    const prPayload = JSON.stringify({
      title: "docs(auto): update AI documentation",
      head: branchName,
      base: "main",
      body: "Auto-generated documentation update by doc-gen-action.\n\n- Updated `" + claudeMdPath + "`\n- Updated `" + claudeMdVerbosePath + "`",
    });
    const tmpPrFile = "/tmp/doc-gen-pr-payload.json";
    writeFileSync(tmpPrFile, prPayload);

    const prResponse = execSync(
      `curl -s -w "\\n%{http_code}" -X POST -H "Authorization: token ${githubToken}" -H "Accept: application/vnd.github.v3+json" https://api.github.com/repos/${consumingRepo}/pulls -d @${tmpPrFile}`,
      { encoding: "utf-8" }
    );
    const prLines = prResponse.trim().split("\n");
    const prStatus = prLines.pop();
    const prBody = prLines.join("\n");
    console.log(`PR API response: HTTP ${prStatus}`);

    if (prStatus === "201") {
      const prUrl = JSON.parse(prBody).html_url;
      console.log(`PR created: ${prUrl}`);
    } else {
      console.log(`::warning::Failed to create PR (HTTP ${prStatus}): ${prBody.substring(0, 500)}`);
    }

    // Switch back to main for the human docs push step
    execSync("git checkout main", { stdio: "inherit" });
  } else {
    console.log("No changes to AI docs — skipping PR creation.");
  }
  console.log("::endgroup::");

  console.log(`::group::Pushing human docs to ${docsRepo}`);
  const humanDocEntries = Object.entries(result.humanDocs);
  console.log(`Human doc types generated: ${humanDocEntries.map(([k]) => k).join(", ")}`);
  console.log(`Target repo: ${docsRepo}`);
  console.log(`Target path: docs/${repoName}/`);

  for (const [docType, content] of humanDocEntries) {
    if (!content) {
      console.log(`Skipping ${docType} — empty content`);
      continue;
    }
    const filePath = `docs/${repoName}/${docType}.md`;
    console.log(`\nPushing ${filePath} (${content.length} chars)...`);

    try {
      // Check if file already exists to get its SHA (needed for updates)
      let existingSha = "";
      console.log(`  Checking if ${filePath} exists in ${docsRepo}...`);
      const existingFileResponse = execSync(
        `curl -s -w "\\n%{http_code}" -H "Authorization: token ${githubToken}" -H "Accept: application/vnd.github.v3+json" https://api.github.com/repos/${docsRepo}/contents/${filePath}`,
        { encoding: "utf-8" }
      );
      const responseLines = existingFileResponse.trim().split("\n");
      const httpStatus = responseLines.pop();
      const responseBody = responseLines.join("\n");
      console.log(`  GET status: ${httpStatus}`);

      let parsed: { sha?: string; content?: string } | null = null;
      if (httpStatus === "200") {
        try {
          parsed = JSON.parse(responseBody);
          if (parsed?.sha) {
            existingSha = parsed.sha;
            console.log(`  Existing file found, SHA: ${existingSha}`);
          }
        } catch (parseErr) {
          console.log(`  Warning: could not parse existing file response`);
        }
      } else {
        console.log(`  File does not exist yet, will create`);
      }

      let finalContent = content;

      if (docType === "release-notes") {
        const dateHeader = `## ${new Date().toISOString().split("T")[0]}`;
        if (existingSha && httpStatus === "200") {
          try {
            const existingContent = Buffer.from(parsed!.content!, "base64").toString("utf-8");
            const withoutTitle = existingContent.replace(/^# Release Notes\n\n/, "");
            finalContent = `# Release Notes\n\n${dateHeader}\n\n${content}\n\n---\n\n${withoutTitle}`;
          } catch {
            finalContent = `# Release Notes\n\n${dateHeader}\n\n${content}`;
          }
        } else {
          finalContent = `# Release Notes\n\n${dateHeader}\n\n${content}`;
        }
      }

      const base64Content = Buffer.from(finalContent).toString("base64");
      const putPayload = JSON.stringify({
        message: `docs(auto): update ${repoName}/${docType} documentation`,
        content: base64Content,
        ...(existingSha ? { sha: existingSha } : {}),
        committer: {
          name: "doc-gen-action",
          email: "doc-gen-action@brightsg.com",
        },
      });

      console.log(`  Payload size: ${putPayload.length} bytes`);
      const tmpFile = `/tmp/doc-payload-${docType}.json`;
      writeFileSync(tmpFile, putPayload);

      console.log(`  PUT ${filePath} to ${docsRepo}...`);
      const putResponse = execSync(
        `curl -s -w "\\n%{http_code}" -X PUT -H "Authorization: token ${githubToken}" -H "Accept: application/vnd.github.v3+json" https://api.github.com/repos/${docsRepo}/contents/${filePath} -d @${tmpFile}`,
        { encoding: "utf-8" }
      );
      const putLines = putResponse.trim().split("\n");
      const putStatus = putLines.pop();
      const putBody = putLines.join("\n");
      console.log(`  PUT status: ${putStatus}`);

      if (putStatus === "200" || putStatus === "201") {
        console.log(`  Successfully pushed ${filePath}`);
      } else {
        console.log(`  PUT response body: ${putBody.substring(0, 500)}`);
        console.log(`::warning::Failed to push ${filePath} — HTTP ${putStatus}`);
      }
    } catch (error) {
      console.log(`::warning::Failed to push ${filePath}: ${error}`);
    }
  }

  // Create category metadata if needed
  const categoryPath = `docs/${repoName}/_category_.json`;
  console.log(`\nChecking category metadata at ${categoryPath}...`);
  try {
    const checkResponse = execSync(
      `curl -s -w "\\n%{http_code}" -H "Authorization: token ${githubToken}" https://api.github.com/repos/${docsRepo}/contents/${categoryPath}`,
      { encoding: "utf-8" }
    );
    const catLines = checkResponse.trim().split("\n");
    const catStatus = catLines.pop();
    console.log(`  GET status: ${catStatus}`);

    if (catStatus === "404") {
      console.log(`  Creating category metadata...`);
      const categoryContent = JSON.stringify({ label: repoName, position: 2 }, null, 2);
      const categoryPayload = JSON.stringify({
        message: `docs(auto): add ${repoName} category metadata`,
        content: Buffer.from(categoryContent).toString("base64"),
        committer: {
          name: "doc-gen-action",
          email: "doc-gen-action@brightsg.com",
        },
      });
      const tmpFile = "/tmp/doc-payload-category.json";
      writeFileSync(tmpFile, categoryPayload);
      const catPutResponse = execSync(
        `curl -s -w "\\n%{http_code}" -X PUT -H "Authorization: token ${githubToken}" -H "Accept: application/vnd.github.v3+json" https://api.github.com/repos/${docsRepo}/contents/${categoryPath} -d @${tmpFile}`,
        { encoding: "utf-8" }
      );
      const catPutLines = catPutResponse.trim().split("\n");
      const catPutStatus = catPutLines.pop();
      console.log(`  PUT status: ${catPutStatus}`);
      if (catPutStatus === "200" || catPutStatus === "201") {
        console.log(`  Created category metadata for ${repoName}`);
      } else {
        const catPutBody = catPutLines.join("\n");
        console.log(`  PUT response: ${catPutBody.substring(0, 500)}`);
        console.log(`::warning::Failed to create category metadata — HTTP ${catPutStatus}`);
      }
    } else {
      console.log(`  Category metadata already exists`);
    }
  } catch (error) {
    console.log(`::warning::Failed to check/create category metadata: ${error}`);
  }
  console.log("::endgroup::");

  console.log(`::notice::Documentation generation complete. Tokens used: ${result.tokenUsage.totalInput + result.tokenUsage.totalOutput}`);
}

main().catch((error) => {
  console.error(`::error::${error.message}`);
  process.exit(1);
});
