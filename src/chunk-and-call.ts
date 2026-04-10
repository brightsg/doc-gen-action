import Anthropic from "@anthropic-ai/sdk";
import type { ContextSection } from "./assemble-context.js";

function estimateTokens(text: string): number {
  return text.length;
}

export function chunkSections(
  sections: ContextSection[],
  maxTokensPerChunk: number
): ContextSection[][] {
  const chunks: ContextSection[][] = [];
  let currentChunk: ContextSection[] = [];
  let currentTokens = 0;

  for (const section of sections) {
    const sectionTokens = estimateTokens(section.content);

    if (currentChunk.length > 0 && currentTokens + sectionTokens > maxTokensPerChunk) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentTokens = 0;
    }

    currentChunk.push(section);
    currentTokens += sectionTokens;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function formatChunkContent(sections: ContextSection[]): string {
  return sections
    .map((s) => `## ${s.label}\n\n${s.content}`)
    .join("\n\n---\n\n");
}

export interface CallClaudeOptions {
  client: Anthropic;
  model: string;
  systemPrompt: string;
  chunks: ContextSection[][];
  stitchPrompt: string;
}

export interface CallClaudeResult {
  text: string;
  totalInputTokens: number;
  totalOutputTokens: number;
}

async function callWithRetry(
  client: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming,
  retries = 3
): Promise<Anthropic.Message> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await client.messages.create(params);
    } catch (error: any) {
      const status = error?.status;
      if (attempt < retries && (status === 429 || status === 500 || status === 503)) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Unreachable");
}

export async function callClaudeWithChunks(
  options: CallClaudeOptions
): Promise<CallClaudeResult> {
  const { client, model, systemPrompt, chunks, stitchPrompt } = options;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  if (chunks.length === 1) {
    const response = await callWithRetry(client, {
      model,
      max_tokens: 16384,
      system: systemPrompt,
      messages: [
        { role: "user", content: formatChunkContent(chunks[0]) },
      ],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    return {
      text,
      totalInputTokens: response.usage.input_tokens,
      totalOutputTokens: response.usage.output_tokens,
    };
  }

  const chunkResults: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkLabel = `[Chunk ${i + 1}/${chunks.length}]`;
    const response = await callWithRetry(client, {
      model,
      max_tokens: 8192,
      system: `${systemPrompt}\n\nYou are processing ${chunkLabel}. Analyse this section and extract the relevant documentation content. Your output will be combined with other chunks later.`,
      messages: [
        { role: "user", content: formatChunkContent(chunks[i]) },
      ],
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    chunkResults.push(`${chunkLabel}\n${text}`);
    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;
  }

  const stitchResponse = await callWithRetry(client, {
    model,
    max_tokens: 16384,
    system: stitchPrompt,
    messages: [
      {
        role: "user",
        content: chunkResults.join("\n\n---\n\n"),
      },
    ],
  });

  const finalText = stitchResponse.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  totalInputTokens += stitchResponse.usage.input_tokens;
  totalOutputTokens += stitchResponse.usage.output_tokens;

  return { text: finalText, totalInputTokens, totalOutputTokens };
}
