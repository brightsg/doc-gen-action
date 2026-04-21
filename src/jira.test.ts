import { describe, it, expect } from "vitest";
import { extractJiraKeys } from "./jira.js";

describe("extractJiraKeys", () => {
  it("should extract keys from commit messages", () => {
    const log = `- feat: add SSP1 form generation BPOLUK-1965 (abc1234)
- fix: resolve pension status TRI-12615 (def5678)
- chore: update deps (ghi9012)`;
    expect(extractJiraKeys(log)).toEqual(["BPOLUK-1965", "TRI-12615"]);
  });

  it("should deduplicate keys", () => {
    const log = `- fix: part one BPOLUK-1965 (abc1234)
- fix: part two BPOLUK-1965 (def5678)`;
    expect(extractJiraKeys(log)).toEqual(["BPOLUK-1965"]);
  });

  it("should handle multiple keys in one line", () => {
    const log = `- fix: resolve BPS-963 and TRI-12615 (abc1234)`;
    expect(extractJiraKeys(log)).toEqual(["BPS-963", "TRI-12615"]);
  });

  it("should return empty array when no keys found", () => {
    const log = `- chore: update deps (abc1234)
- ci: fix workflow (def5678)`;
    expect(extractJiraKeys(log)).toEqual([]);
  });

  it("should return empty array for empty input", () => {
    expect(extractJiraKeys("")).toEqual([]);
  });
});
