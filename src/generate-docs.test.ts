import { describe, it, expect, vi } from "vitest";
import { generateDocs, type GenerateDocsOptions } from "./generate-docs.js";
import type { ContextPayload } from "./assemble-context.js";

// Mock fs to avoid loading prompt files from disk
vi.mock("fs", async () => {
  const actual = await vi.importActual("fs");
  return {
    ...actual,
    readFileSync: vi.fn().mockReturnValue("Mock prompt content"),
  };
});

describe("generateDocs", () => {
  const mockPayload: ContextPayload = {
    sections: [
      { label: "Structural Files", content: "solution content" },
      { label: "Full Codebase", content: "all the code" },
    ],
  };

  it("should generate all doc types and return results", async () => {
    const mockClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "Generated documentation content" }],
          usage: { input_tokens: 1000, output_tokens: 500 },
        }),
      },
    };

    const result = await generateDocs({
      client: mockClient as any,
      model: "claude-sonnet-4-6",
      payload: mockPayload,
      humanDocTypes: ["api", "architecture", "onboarding"],
      maxTokensPerChunk: 150_000,
    });

    expect(result.claudeMd).toBeDefined();
    expect(result.claudeMdVerbose).toBeDefined();
    expect(result.humanDocs.api).toBeDefined();
    expect(result.humanDocs.architecture).toBeDefined();
    expect(result.humanDocs.onboarding).toBeDefined();
    expect(result.tokenUsage.totalInput).toBeGreaterThan(0);
    expect(result.tokenUsage.totalOutput).toBeGreaterThan(0);
  });

  it("should only generate requested human doc types", async () => {
    const mockClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "Generated content" }],
          usage: { input_tokens: 1000, output_tokens: 500 },
        }),
      },
    };

    const result = await generateDocs({
      client: mockClient as any,
      model: "claude-sonnet-4-6",
      payload: mockPayload,
      humanDocTypes: ["api"],
      maxTokensPerChunk: 150_000,
    });

    expect(result.humanDocs.api).toBeDefined();
    expect(result.humanDocs.architecture).toBeUndefined();
    expect(result.humanDocs.onboarding).toBeUndefined();
  });
});
