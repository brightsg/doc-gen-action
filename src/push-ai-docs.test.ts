import { describe, it, expect, vi } from "vitest";
import { pushAiDocs, type PushAiDocsDeps } from "./push-ai-docs.js";

interface RecordedCall {
  fn: "git" | "postJson";
  arg: string;
}

interface FakeGitConfig {
  /** stdout for `diff --cached --name-only` (defaults to "CLAUDE.md\nCLAUDE-VERBOSE.md"). */
  stagedFiles?: string;
  /** Throw on `push origin HEAD:refs/heads/main` to simulate ruleset rejection. */
  rejectDirectPush?: boolean;
  /** Throw on `push origin "<branch>"` to simulate other failure (rare). */
  rejectBranchPush?: boolean;
}

interface FakePostJsonConfig {
  status?: number;
  body?: string;
}

function makeDeps(
  gitConfig: FakeGitConfig = {},
  postConfig: FakePostJsonConfig = {}
): { deps: PushAiDocsDeps; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const deps: PushAiDocsDeps = {
    git: vi.fn((args: string) => {
      calls.push({ fn: "git", arg: args });
      if (args === "diff --cached --name-only") {
        return gitConfig.stagedFiles ?? "CLAUDE.md\nCLAUDE-VERBOSE.md\n";
      }
      if (args === "push origin HEAD:refs/heads/main" && gitConfig.rejectDirectPush) {
        throw new Error("remote: error: GH013: Repository rule violations found.");
      }
      if (args.startsWith("push origin \"") && gitConfig.rejectBranchPush) {
        throw new Error("remote: rejected branch push");
      }
      return "";
    }),
    postJson: vi.fn((url: string, _payload: unknown) => {
      calls.push({ fn: "postJson", arg: url });
      return {
        status: postConfig.status ?? 201,
        body:
          postConfig.body ??
          JSON.stringify({ html_url: "https://github.com/brightsg/example/pull/42" }),
      };
    }),
    log: vi.fn(),
  };
  return { deps, calls };
}

const baseOpts = {
  consumingRepo: "brightsg/example",
  filePaths: ["CLAUDE.md", "CLAUDE-VERBOSE.md"],
  commitMessage: "docs(auto): update AI documentation",
  prTitle: "docs(auto): update AI documentation",
  prBody: "Auto-generated documentation update.",
  branchName: "docs/auto-update-test",
};

describe("pushAiDocs", () => {
  it("returns no-changes and skips commit/push when nothing is staged", () => {
    const { deps, calls } = makeDeps({ stagedFiles: "" });

    const result = pushAiDocs(deps, baseOpts);

    expect(result).toEqual({ kind: "no-changes" });
    const gitCalls = calls.filter((c) => c.fn === "git").map((c) => c.arg);
    expect(gitCalls).toContain("diff --cached --name-only");
    expect(gitCalls).not.toContain("checkout -b \"docs/auto-update-test\"");
    expect(gitCalls.find((c) => c.startsWith("commit"))).toBeUndefined();
    expect(gitCalls.find((c) => c.startsWith("push"))).toBeUndefined();
    expect(calls.find((c) => c.fn === "postJson")).toBeUndefined();
  });

  it("pushes directly to main and skips PR when ruleset allows direct push", () => {
    const { deps, calls } = makeDeps();

    const result = pushAiDocs(deps, baseOpts);

    expect(result).toEqual({ kind: "direct-push" });
    const gitCalls = calls.filter((c) => c.fn === "git").map((c) => c.arg);
    expect(gitCalls).toContain("push origin HEAD:refs/heads/main");
    expect(gitCalls).toContain("checkout main");
    expect(calls.find((c) => c.fn === "postJson")).toBeUndefined();
  });

  it("falls back to PR creation when direct push is rejected", () => {
    const { deps, calls } = makeDeps({ rejectDirectPush: true });

    const result = pushAiDocs(deps, baseOpts);

    expect(result).toEqual({
      kind: "pr-created",
      url: "https://github.com/brightsg/example/pull/42",
    });
    const gitCalls = calls.filter((c) => c.fn === "git").map((c) => c.arg);
    expect(gitCalls).toContain("push origin HEAD:refs/heads/main");
    expect(gitCalls).toContain('push origin "docs/auto-update-test"');
    expect(gitCalls).toContain("checkout main");
    const postCall = calls.find((c) => c.fn === "postJson");
    expect(postCall?.arg).toBe(
      "https://api.github.com/repos/brightsg/example/pulls"
    );
  });

  it("returns pr-failed and warns when PR creation HTTP call fails", () => {
    const { deps } = makeDeps(
      { rejectDirectPush: true },
      { status: 422, body: '{"message":"Validation Failed"}' }
    );

    const result = pushAiDocs(deps, baseOpts);

    expect(result).toEqual({
      kind: "pr-failed",
      status: 422,
      body: '{"message":"Validation Failed"}',
    });
    expect(deps.log).toHaveBeenCalledWith(
      expect.stringContaining("::warning::Failed to create PR")
    );
  });

  it("posts the correct PR payload to the consuming repo's pulls endpoint", () => {
    const { deps } = makeDeps({ rejectDirectPush: true });

    pushAiDocs(deps, baseOpts);

    expect(deps.postJson).toHaveBeenCalledWith(
      "https://api.github.com/repos/brightsg/example/pulls",
      {
        title: "docs(auto): update AI documentation",
        head: "docs/auto-update-test",
        base: "main",
        body: "Auto-generated documentation update.",
      }
    );
  });

  it("uses an auto-generated branch name when none is provided", () => {
    const { deps, calls } = makeDeps();

    const { branchName: _omit, ...optsWithoutBranch } = baseOpts;
    pushAiDocs(deps, optsWithoutBranch);

    const checkoutCall = calls
      .filter((c) => c.fn === "git")
      .map((c) => c.arg)
      .find((c) => c.startsWith("checkout -b"));
    expect(checkoutCall).toMatch(/^checkout -b "docs\/auto-update-\d+"$/);
  });

  it("returns pr-created with empty url when API response body is unparseable", () => {
    const { deps } = makeDeps(
      { rejectDirectPush: true },
      { status: 201, body: "not-json" }
    );

    const result = pushAiDocs(deps, baseOpts);

    expect(result).toEqual({ kind: "pr-created", url: "" });
  });

  it("escapes single quotes in commit message safely", () => {
    const { deps, calls } = makeDeps();

    pushAiDocs(deps, {
      ...baseOpts,
      commitMessage: "docs(auto): can't break this",
    });

    const commitCall = calls
      .filter((c) => c.fn === "git")
      .map((c) => c.arg)
      .find((c) => c.startsWith("commit"));
    // The single quote should be escaped via the standard '\'' shell idiom.
    expect(commitCall).toBe(`commit -m 'docs(auto): can'\\''t break this'`);
  });
});
