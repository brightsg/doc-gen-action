export interface RepoFile {
  path: string;
  content: string;
}

export interface ContextSection {
  label: string;
  content: string;
}

export interface ContextPayload {
  sections: ContextSection[];
}

export interface BuildContextOptions {
  isFirstRun: boolean;
  structuralFiles: RepoFile[];
  existingDocs: RepoFile[];
  diff: string;
  changedFiles: RepoFile[];
  allSourceFiles: RepoFile[];
}

function formatFiles(files: RepoFile[]): string {
  return files
    .map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join("\n\n");
}

export function buildContextPayload(options: BuildContextOptions): ContextPayload {
  const sections: ContextSection[] = [];

  sections.push({
    label: "Structural Files",
    content: formatFiles(options.structuralFiles),
  });

  if (options.isFirstRun) {
    if (options.existingDocs.length > 0) {
      sections.push({
        label: "Existing Documentation",
        content: formatFiles(options.existingDocs),
      });
    }

    if (options.allSourceFiles.length > 0) {
      sections.push({
        label: "Full Codebase",
        content: formatFiles(options.allSourceFiles),
      });
    }
  } else {
    sections.push({
      label: "Existing Documentation",
      content: formatFiles(options.existingDocs),
    });

    sections.push({
      label: "Git Diff",
      content: `\`\`\`diff\n${options.diff}\n\`\`\``,
    });

    sections.push({
      label: "Changed Files (Full Content)",
      content: formatFiles(options.changedFiles),
    });
  }

  return { sections };
}

export function isFirstRun(claudeMdContent: string | null): boolean {
  if (!claudeMdContent) return true;
  return !claudeMdContent.includes("<!-- generated -->");
}
