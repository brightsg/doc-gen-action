import { describe, it, expect } from "vitest";
import { buildContextPayload, type RepoFile } from "./assemble-context.js";

const structuralFiles: RepoFile[] = [
  { path: "BrightConnect.slnx", content: "<solution content>" },
  { path: "src/BrightConnect.Api/BrightConnect.Api.csproj", content: "<project xml>" },
];

const existingDocs: RepoFile[] = [
  { path: "CLAUDE.md", content: "# Existing CLAUDE.md\n<!-- generated -->" },
];

describe("buildContextPayload", () => {
  it("should build incremental payload when docs exist", () => {
    const diff = "diff --git a/src/Foo.cs b/src/Foo.cs\n+added line";
    const changedFiles: RepoFile[] = [
      { path: "src/BrightConnect.Api/Foo.cs", content: "public class Foo {}" },
    ];

    const result = buildContextPayload({
      isFirstRun: false,
      structuralFiles,
      existingDocs,
      diff,
      changedFiles,
      allSourceFiles: [],
    });

    expect(result.sections).toHaveLength(4);
    expect(result.sections.map((s) => s.label)).toEqual([
      "Structural Files",
      "Existing Documentation",
      "Git Diff",
      "Changed Files (Full Content)",
    ]);
  });

  it("should build full payload on first run", () => {
    const allSourceFiles: RepoFile[] = [
      { path: "src/BrightConnect.Api/Foo.cs", content: "public class Foo {}" },
      { path: "src/BrightConnect.Domain/IBar.cs", content: "public interface IBar {}" },
    ];

    const result = buildContextPayload({
      isFirstRun: true,
      structuralFiles,
      existingDocs: [],
      diff: "",
      changedFiles: [],
      allSourceFiles,
    });

    expect(result.sections).toHaveLength(2);
    expect(result.sections.map((s) => s.label)).toEqual([
      "Structural Files",
      "Full Codebase",
    ]);
  });

  it("should detect first run from missing generated marker", () => {
    const docsWithoutMarker: RepoFile[] = [
      { path: "CLAUDE.md", content: "# Hand-written CLAUDE.md" },
    ];

    const result = buildContextPayload({
      isFirstRun: true,
      structuralFiles,
      existingDocs: docsWithoutMarker,
      diff: "",
      changedFiles: [],
      allSourceFiles: [],
    });

    expect(result.sections.map((s) => s.label)).toContain("Existing Documentation");
  });
});
