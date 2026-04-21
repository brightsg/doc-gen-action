import { describe, it, expect } from "vitest";
import { resolveDocTypes, VALID_PROJECT_TYPES, type ProjectType } from "./resolve-doc-types.js";

describe("resolveDocTypes", () => {
  it("should resolve api to shared + api", () => {
    const result = resolveDocTypes("api");
    expect(result).toEqual(["architecture", "onboarding", "changelog-internal", "changelog-external", "api"]);
  });

  it("should resolve worker to shared + worker", () => {
    const result = resolveDocTypes("worker");
    expect(result).toEqual(["architecture", "onboarding", "changelog-internal", "changelog-external", "worker"]);
  });

  it("should resolve sdk to shared + sdk-usage", () => {
    const result = resolveDocTypes("sdk");
    expect(result).toEqual(["architecture", "onboarding", "changelog-internal", "changelog-external", "sdk-usage"]);
  });

  it("should resolve frontend to shared + frontend-usage", () => {
    const result = resolveDocTypes("frontend");
    expect(result).toEqual(["architecture", "onboarding", "changelog-internal", "changelog-external", "frontend-usage"]);
  });

  it("should resolve cli to shared + cli-reference", () => {
    const result = resolveDocTypes("cli");
    expect(result).toEqual(["architecture", "onboarding", "changelog-internal", "changelog-external", "cli-reference"]);
  });

  it("should resolve comma-separated types and deduplicate shared docs", () => {
    const result = resolveDocTypes("api,worker");
    expect(result).toEqual(["architecture", "onboarding", "changelog-internal", "changelog-external", "api", "worker"]);
  });

  it("should handle whitespace in comma-separated input", () => {
    const result = resolveDocTypes(" api , worker ");
    expect(result).toEqual(["architecture", "onboarding", "changelog-internal", "changelog-external", "api", "worker"]);
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
