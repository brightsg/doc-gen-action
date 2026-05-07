import { execSync } from "child_process";
import { writeFileSync } from "fs";

export interface PushAiDocsDeps {
  /** Run a git command. Returns stdout. Throws on non-zero exit. */
  git: (args: string) => string;
  /** POST JSON to a URL. Returns response status + body. Does not throw on non-2xx. */
  postJson: (url: string, payload: unknown) => { status: number; body: string };
  /** Logger. */
  log: (msg: string) => void;
}

export interface PushAiDocsOpts {
  /** "owner/repo" of the consuming repository where the AI docs live. */
  consumingRepo: string;
  /** Paths (relative to repo root) of files that should be committed. Already written to disk. */
  filePaths: string[];
  /** Commit message used for both direct push and PR-fallback commits. */
  commitMessage: string;
  /** PR title — only used if direct push is rejected and we fall back to a PR. */
  prTitle: string;
  /** PR body — only used if direct push is rejected and we fall back to a PR. */
  prBody: string;
  /** Override branch name for deterministic tests. Defaults to `docs/auto-update-${Date.now()}`. */
  branchName?: string;
}

export type PushAiDocsResult =
  | { kind: "no-changes" }
  | { kind: "direct-push" }
  | { kind: "pr-created"; url: string }
  | { kind: "pr-failed"; status: number; body: string };

/**
 * Commit the staged AI docs and try to push them directly to main on the consuming repo.
 * If the push is rejected (typically by branch protection / a ruleset that the action's
 * actor cannot bypass), fall back to opening a PR from a docs/auto-update-* branch.
 *
 * Why a branch + refspec push (rather than committing on main locally first):
 *   We need a side-stable artifact to either fast-forward main or push as a separate
 *   branch. Committing on a temp branch means we don't have to rewrite local main
 *   if the direct push fails — we just push the same branch via a different refspec.
 */
export function pushAiDocs(
  deps: PushAiDocsDeps,
  opts: PushAiDocsOpts
): PushAiDocsResult {
  const { git, postJson, log } = deps;
  const { consumingRepo, filePaths, commitMessage, prTitle, prBody } = opts;
  const branchName = opts.branchName ?? `docs/auto-update-${Date.now()}`;

  git(`config user.name "doc-gen-action"`);
  git(`config user.email "doc-gen-action@brightsg.com"`);

  for (const path of filePaths) {
    git(`add "${path}"`);
  }

  const staged = git(`diff --cached --name-only`).trim();
  if (!staged) {
    log("No changes to AI docs — skipping commit/push.");
    return { kind: "no-changes" };
  }

  git(`checkout -b "${branchName}"`);
  git(`commit -m ${shellQuote(commitMessage)}`);

  // Try direct push. The refspec HEAD:refs/heads/main pushes the current branch HEAD
  // straight to remote main; this is a fast-forward update because the branch was just
  // created from main and is exactly one commit ahead.
  try {
    git(`push origin HEAD:refs/heads/main`);
    log("AI docs pushed directly to main.");
    git(`checkout main`);
    try {
      git(`branch -D "${branchName}"`);
    } catch {
      // Local branch cleanup is best-effort — runners are ephemeral.
    }
    return { kind: "direct-push" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(
      `Direct push to main rejected (likely branch protection / ruleset). Falling back to PR. Cause: ${msg}`
    );
  }

  git(`push origin "${branchName}"`);

  log(`Creating PR on ${consumingRepo} from ${branchName} → main`);
  const prResponse = postJson(
    `https://api.github.com/repos/${consumingRepo}/pulls`,
    { title: prTitle, head: branchName, base: "main", body: prBody }
  );

  git(`checkout main`);

  if (prResponse.status === 201) {
    let url = "";
    try {
      const parsed = JSON.parse(prResponse.body);
      if (parsed && typeof parsed.html_url === "string") {
        url = parsed.html_url;
      }
    } catch {
      // PR was created but body wasn't parseable JSON — still treat as success.
    }
    log(`PR created: ${url}`);
    return { kind: "pr-created", url };
  }

  log(
    `::warning::Failed to create PR (HTTP ${prResponse.status}): ${prResponse.body.substring(0, 500)}`
  );
  return { kind: "pr-failed", status: prResponse.status, body: prResponse.body };
}

/**
 * Wrap a string in single quotes for safe shell interpolation.
 * Embedded single quotes are escaped via the standard '\'' trick.
 */
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Default deps that shell out via child_process and curl. Used in production;
 * tests should construct their own deps with mocked git/postJson.
 */
export function createDefaultDeps(githubToken: string): PushAiDocsDeps {
  return {
    git: (args) =>
      execSync(`git ${args}`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "inherit"],
      }),
    postJson: (url, payload) => {
      const tmpFile = `/tmp/doc-gen-post-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
      writeFileSync(tmpFile, JSON.stringify(payload));
      const response = execSync(
        `curl -s -w "\\n%{http_code}" -X POST -H "Authorization: token ${githubToken}" -H "Accept: application/vnd.github.v3+json" "${url}" -d @${tmpFile}`,
        { encoding: "utf-8" }
      );
      const lines = response.trim().split("\n");
      const statusLine = lines.pop() || "0";
      const status = parseInt(statusLine, 10) || 0;
      const body = lines.join("\n");
      return { status, body };
    },
    log: (msg) => console.log(msg),
  };
}
