import type { HumanDocType } from "./generate-docs.js";

export type ProjectType = "api" | "worker" | "sdk" | "frontend" | "cli";

export const VALID_PROJECT_TYPES: ProjectType[] = ["api", "worker", "sdk", "frontend", "cli"];

const PROJECT_TYPE_DOC_MAP: Record<ProjectType, HumanDocType[]> = {
  api: ["api"],
  worker: ["worker"],
  sdk: ["sdk-usage"],
  frontend: ["frontend-usage"],
  cli: ["cli-reference"],
};

const SHARED_DOC_TYPES: HumanDocType[] = ["architecture", "onboarding", "changelog-internal", "changelog-external"];

export function resolveDocTypes(projectTypeInput: string): HumanDocType[] {
  const trimmed = projectTypeInput.trim();
  if (!trimmed) {
    throw new Error("project-type is empty");
  }

  const projectTypes = trimmed.split(",").map((s) => s.trim());
  const typeSpecificDocs: HumanDocType[] = [];

  for (const pt of projectTypes) {
    if (!VALID_PROJECT_TYPES.includes(pt as ProjectType)) {
      throw new Error(
        `Unknown project type "${pt}". Valid types: ${VALID_PROJECT_TYPES.join(", ")}`
      );
    }
    typeSpecificDocs.push(...PROJECT_TYPE_DOC_MAP[pt as ProjectType]);
  }

  return [...SHARED_DOC_TYPES, ...typeSpecificDocs];
}
