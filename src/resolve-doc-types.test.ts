import { describe, it, expect } from "vitest";
import { resolveDocTypes, VALID_PROJECT_TYPES, type ProjectType } from "./resolve-doc-types.js";

describe("resolveDocTypes", () => {
  it("should resolve api to architecture, onboarding, release-notes, api", () => {
    const result = resolveDocTypes("api");
    expect(result).toEqual(["architecture", "onboarding", "release-notes", "api"]);
  });

  it("should resolve worker to architecture, onboarding, release-notes, worker", () => {
    const result = resolveDocTypes("worker");
    expect(result).toEqual(["architecture", "onboarding", "release-notes", "worker"]);
  });

  it("should resolve sdk to architecture, onboarding, release-notes, sdk-usage", () => {
    const result = resolveDocTypes("sdk");
    expect(result).toEqual(["architecture", "onboarding", "release-notes", "sdk-usage"]);
  });

  it("should resolve frontend to architecture, onboarding, release-notes, frontend-usage", () => {
    const result = resolveDocTypes("frontend");
    expect(result).toEqual(["architecture", "onboarding", "release-notes", "frontend-usage"]);
  });

  it("should resolve cli to architecture, onboarding, release-notes, cli-reference", () => {
    const result = resolveDocTypes("cli");
    expect(result).toEqual(["architecture", "onboarding", "release-notes", "cli-reference"]);
  });

  it("should resolve comma-separated types and deduplicate shared docs", () => {
    const result = resolveDocTypes("api,worker");
    expect(result).toEqual(["architecture", "onboarding", "release-notes", "api", "worker"]);
  });

  it("should handle whitespace in comma-separated input", () => {
    const result = resolveDocTypes(" api , worker ");
    expect(result).toEqual(["architecture", "onboarding", "release-notes", "api", "worker"]);
  });

  it("should throw on unrecognised project type", () => {
    expect(() => resolveDocTypes("database")).toThrow(
      'Unknown project type "database". Valid types: api, worker, sdk, frontend, cli'
    );
  });

  it("should throw on empty string", () => {
    expect(() => resolveDocTypes("")).toThrow(
      "project-type is empty"
    );
  });
});

describe("VALID_PROJECT_TYPES", () => {
  it("should contain all five types", () => {
    expect(VALID_PROJECT_TYPES).toEqual(["api", "worker", "sdk", "frontend", "cli"]);
  });
});
