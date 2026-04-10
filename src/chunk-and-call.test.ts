import { describe, it, expect, vi } from "vitest";
import { chunkSections, callClaudeWithChunks } from "./chunk-and-call.js";
import type { ContextSection } from "./assemble-context.js";

describe("chunkSections", () => {
  it("should keep small sections in a single chunk", () => {
    const sections: ContextSection[] = [
      { label: "A", content: "short content" },
      { label: "B", content: "also short" },
    ];

    const chunks = chunkSections(sections, 100_000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(2);
  });

  it("should split large sections into separate chunks", () => {
    const largeContent = "x".repeat(80_000);
    const sections: ContextSection[] = [
      { label: "A", content: largeContent },
      { label: "B", content: largeContent },
    ];

    const chunks = chunkSections(sections, 100_000);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(1);
    expect(chunks[1]).toHaveLength(1);
  });

  it("should group sections that fit together", () => {
    const mediumContent = "x".repeat(40_000);
    const sections: ContextSection[] = [
      { label: "A", content: mediumContent },
      { label: "B", content: mediumContent },
      { label: "C", content: mediumContent },
    ];

    const chunks = chunkSections(sections, 100_000);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(2);
    expect(chunks[1]).toHaveLength(1);
  });
});

describe("callClaudeWithChunks", () => {
  it("should call API for each chunk and return combined result", async () => {
    const mockClient = {
      messages: {
        create: vi.fn()
          .mockResolvedValueOnce({
            content: [{ type: "text", text: "Result from chunk 1" }],
            usage: { input_tokens: 100, output_tokens: 50 },
          })
          .mockResolvedValueOnce({
            content: [{ type: "text", text: "Result from chunk 2" }],
            usage: { input_tokens: 100, output_tokens: 50 },
          })
          .mockResolvedValueOnce({
            content: [{ type: "text", text: "Final stitched result" }],
            usage: { input_tokens: 200, output_tokens: 100 },
          }),
      },
    };

    const chunks: ContextSection[][] = [
      [{ label: "A", content: "content A" }],
      [{ label: "B", content: "content B" }],
    ];

    const result = await callClaudeWithChunks({
      client: mockClient as any,
      model: "claude-sonnet-4-6",
      systemPrompt: "Generate docs",
      chunks,
      stitchPrompt: "Combine these results into a single document",
    });

    expect(result.text).toBe("Final stitched result");
    expect(result.totalInputTokens).toBe(400);
    expect(result.totalOutputTokens).toBe(200);
    expect(mockClient.messages.create).toHaveBeenCalledTimes(3);
  });

  it("should skip stitching for a single chunk", async () => {
    const mockClient = {
      messages: {
        create: vi.fn().mockResolvedValueOnce({
          content: [{ type: "text", text: "Direct result" }],
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      },
    };

    const chunks: ContextSection[][] = [
      [{ label: "A", content: "content A" }],
    ];

    const result = await callClaudeWithChunks({
      client: mockClient as any,
      model: "claude-sonnet-4-6",
      systemPrompt: "Generate docs",
      chunks,
      stitchPrompt: "Combine",
    });

    expect(result.text).toBe("Direct result");
    expect(mockClient.messages.create).toHaveBeenCalledTimes(1);
  });
});
