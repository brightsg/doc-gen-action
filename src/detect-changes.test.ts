import { describe, it, expect } from "vitest";
import { categoriseChanges, shouldSkipGeneration } from "./detect-changes.js";

describe("categoriseChanges", () => {
  it("should categorise files by project directory", () => {
    const files = [
      "src/BrightConnect.Api/Controllers/FooController.cs",
      "src/BrightConnect.Domain/Interfaces/IFooRepository.cs",
      "tests/BrightConnect.Api.UnitTests/FooTests.cs",
    ];

    const result = categoriseChanges(files);

    expect(result.sourceChanges).toEqual({
      "BrightConnect.Api": ["src/BrightConnect.Api/Controllers/FooController.cs"],
      "BrightConnect.Domain": ["src/BrightConnect.Domain/Interfaces/IFooRepository.cs"],
    });
    expect(result.testChanges).toEqual({
      "BrightConnect.Api.UnitTests": ["tests/BrightConnect.Api.UnitTests/FooTests.cs"],
    });
  });

  it("should handle root-level files", () => {
    const files = ["README.md", "CLAUDE.md", ".gitignore"];
    const result = categoriseChanges(files);

    expect(result.rootChanges).toEqual(["README.md", "CLAUDE.md", ".gitignore"]);
    expect(result.sourceChanges).toEqual({});
  });
});

describe("shouldSkipGeneration", () => {
  it("should skip when only ignored files changed", () => {
    const files = [".gitignore", ".github/workflows/build-only.yml", "package-lock.json"];
    const ignorePatterns = [".gitignore", ".github/**", "*.lock", "package-lock.json"];

    expect(shouldSkipGeneration(files, ignorePatterns)).toBe(true);
  });

  it("should not skip when source files changed", () => {
    const files = [".gitignore", "src/BrightConnect.Api/Startup.cs"];
    const ignorePatterns = [".gitignore"];

    expect(shouldSkipGeneration(files, ignorePatterns)).toBe(false);
  });

  it("should not skip when no ignore patterns match", () => {
    const files = ["src/Foo.cs"];
    const ignorePatterns = [".gitignore"];

    expect(shouldSkipGeneration(files, ignorePatterns)).toBe(false);
  });
});
