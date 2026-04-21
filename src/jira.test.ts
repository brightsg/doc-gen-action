import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractJiraKeys, fetchJiraIssues, type JiraIssueDetail } from "./jira.js";

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

// Add at top level, after existing describe block:
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("fetchJiraIssues", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should fetch and map issue details", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        key: "BPOLUK-1965",
        fields: {
          summary: "Add SSP1 form generation",
          description: { content: [{ content: [{ text: "Full description here" }] }] },
          issuetype: { name: "Story" },
          status: { name: "Done" },
          project: { name: "BrightPay Online UK" },
          issuelinks: [
            { outwardIssue: { key: "BPOLUK-1900" } },
          ],
        },
      }),
    });

    const result = await fetchJiraIssues(
      ["BPOLUK-1965"],
      "user@example.com",
      "api-token-123",
      "brightsg.atlassian.net"
    );

    expect(result["BPOLUK-1965"]).toEqual({
      key: "BPOLUK-1965",
      summary: "Add SSP1 form generation",
      description: "Full description here",
      issueType: "Story",
      status: "Done",
      project: "BrightPay Online UK",
      linkedIssues: ["BPOLUK-1900"],
    });
  });

  it("should skip failed requests and continue", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 404, statusText: "Not Found" })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          key: "TRI-100",
          fields: {
            summary: "Fix bug",
            description: null,
            issuetype: { name: "Bug" },
            status: { name: "Done" },
            project: { name: "Triage" },
            issuelinks: [],
          },
        }),
      });

    const result = await fetchJiraIssues(
      ["BAD-999", "TRI-100"],
      "user@example.com",
      "token",
      "brightsg.atlassian.net"
    );

    expect(result["BAD-999"]).toBeUndefined();
    expect(result["TRI-100"]).toBeDefined();
    expect(result["TRI-100"].summary).toBe("Fix bug");
  });

  it("should return empty map for empty keys array", async () => {
    const result = await fetchJiraIssues([], "user@example.com", "token", "host");
    expect(result).toEqual({});
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
