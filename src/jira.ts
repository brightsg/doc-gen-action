export function extractJiraKeys(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/[A-Z][A-Z0-9]+-\d+/g);
  if (!matches) return [];
  return [...new Set(matches)];
}
