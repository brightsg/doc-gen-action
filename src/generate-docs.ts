import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { ContextPayload } from "./assemble-context.js";
import { chunkSections, callClaudeWithChunks } from "./chunk-and-call.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const promptsDir = resolve(__dirname, "..", "prompts");

export function loadPrompt(name: string): string {
  return readFileSync(resolve(promptsDir, `${name}.md`), "utf-8");
}

export type HumanDocType = "api" | "architecture" | "onboarding" | "worker" | "sdk-usage" | "cli-reference" | "frontend-usage" | "changelog-internal" | "changelog-external";

export interface GenerateDocsOptions {
  client: Anthropic;
  model: string;
  payload: ContextPayload;
  humanDocTypes: HumanDocType[];
  maxTokensPerChunk: number;
}

export interface GenerateDocsResult {
  claudeMd: string;
  claudeMdVerbose: string;
  humanDocs: Partial<Record<HumanDocType, string>>;
  tokenUsage: {
    totalInput: number;
    totalOutput: number;
  };
}

const humanDocPromptMap: Record<HumanDocType, string> = {
  api: "api-docs",
  architecture: "architecture-docs",
  onboarding: "onboarding-docs",
  worker: "worker-docs",
  "sdk-usage": "sdk-usage-docs",
  "cli-reference": "cli-reference-docs",
  "frontend-usage": "frontend-usage-docs",
  "changelog-internal": "changelog-internal-docs",
  "changelog-external": "changelog-external-docs",
};

export async function generateDocs(options: GenerateDocsOptions): Promise<GenerateDocsResult> {
  const { client, model, payload, humanDocTypes, maxTokensPerChunk } = options;
  const chunks = chunkSections(payload.sections, maxTokensPerChunk);

  let totalInput = 0;
  let totalOutput = 0;

  const claudeMdResult = await callClaudeWithChunks({
    client,
    model,
    systemPrompt: loadPrompt("claude-md"),
    chunks,
    stitchPrompt: "Combine these analysis results into a single, concise CLAUDE.md file following the format specified. Keep it under 200 lines.",
  });
  totalInput += claudeMdResult.totalInputTokens;
  totalOutput += claudeMdResult.totalOutputTokens;

  const claudeMdVerboseResult = await callClaudeWithChunks({
    client,
    model,
    systemPrompt: loadPrompt("claude-md-verbose"),
    chunks,
    stitchPrompt: "Combine these analysis results into a comprehensive CLAUDE-VERBOSE.md file following the format specified.",
  });
  totalInput += claudeMdVerboseResult.totalInputTokens;
  totalOutput += claudeMdVerboseResult.totalOutputTokens;

  const humanDocs: Partial<Record<HumanDocType, string>> = {};

  for (const docType of humanDocTypes) {
    const promptName = humanDocPromptMap[docType];
    const result = await callClaudeWithChunks({
      client,
      model,
      systemPrompt: loadPrompt(promptName),
      chunks,
      stitchPrompt: `Combine these analysis results into a single, well-structured ${docType} documentation file.`,
    });
    humanDocs[docType] = result.text;
    totalInput += result.totalInputTokens;
    totalOutput += result.totalOutputTokens;
  }

  return {
    claudeMd: claudeMdResult.text,
    claudeMdVerbose: claudeMdVerboseResult.text,
    humanDocs,
    tokenUsage: { totalInput, totalOutput },
  };
}
