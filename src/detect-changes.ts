export interface ChangeCategories {
  sourceChanges: Record<string, string[]>;
  testChanges: Record<string, string[]>;
  rootChanges: string[];
}

export function categoriseChanges(files: string[]): ChangeCategories {
  const sourceChanges: Record<string, string[]> = {};
  const testChanges: Record<string, string[]> = {};
  const rootChanges: string[] = [];

  for (const file of files) {
    if (file.startsWith("src/")) {
      const parts = file.split("/");
      const project = parts[1];
      if (!sourceChanges[project]) sourceChanges[project] = [];
      sourceChanges[project].push(file);
    } else if (file.startsWith("tests/")) {
      const parts = file.split("/");
      const project = parts[1];
      if (!testChanges[project]) testChanges[project] = [];
      testChanges[project].push(file);
    } else {
      rootChanges.push(file);
    }
  }

  return { sourceChanges, testChanges, rootChanges };
}

function matchesPattern(file: string, pattern: string): boolean {
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return file.startsWith(prefix + "/") || file === prefix;
  }
  if (pattern.startsWith("*.")) {
    const ext = pattern.slice(1);
    return file.endsWith(ext);
  }
  return file === pattern;
}

export function shouldSkipGeneration(files: string[], ignorePatterns: string[]): boolean {
  return files.every((file) =>
    ignorePatterns.some((pattern) => matchesPattern(file, pattern))
  );
}
