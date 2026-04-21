export function extractJiraKeys(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/[A-Z][A-Z0-9]+-\d+/g);
  if (!matches) return [];
  return [...new Set(matches)];
}

export interface JiraIssueDetail {
  key: string;
  summary: string;
  description: string;
  issueType: string;
  status: string;
  project: string;
  linkedIssues: string[];
}

export type JiraIssueMap = Record<string, JiraIssueDetail>;

function extractDescription(description: unknown): string {
  if (!description || typeof description !== "object") return "";
  try {
    const doc = description as { content?: Array<{ content?: Array<{ text?: string }> }> };
    return (
      doc.content
        ?.flatMap((block) => block.content?.map((inline) => inline.text ?? "") ?? [])
        .join(" ")
        .trim() ?? ""
    );
  } catch {
    return "";
  }
}

function extractLinkedIssueKeys(issuelinks: unknown[]): string[] {
  const keys: string[] = [];
  for (const link of issuelinks) {
    const l = link as { outwardIssue?: { key?: string }; inwardIssue?: { key?: string } };
    if (l.outwardIssue?.key) keys.push(l.outwardIssue.key);
    if (l.inwardIssue?.key) keys.push(l.inwardIssue.key);
  }
  return keys;
}

export async function fetchJiraIssues(
  keys: string[],
  email: string,
  token: string,
  host: string
): Promise<JiraIssueMap> {
  if (keys.length === 0) return {};

  const result: JiraIssueMap = {};
  const auth = Buffer.from(`${email}:${token}`).toString("base64");

  for (const key of keys) {
    try {
      const response = await fetch(
        `https://${host}/rest/api/3/issue/${key}`,
        {
          headers: {
            Authorization: `Basic ${auth}`,
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        console.log(`  Jira: failed to fetch ${key} (HTTP ${response.status}) — skipping`);
        continue;
      }

      const data = await response.json() as {
        key: string;
        fields: {
          summary: string;
          description: unknown;
          issuetype: { name: string };
          status: { name: string };
          project: { name: string };
          issuelinks: unknown[];
        };
      };

      result[key] = {
        key: data.key,
        summary: data.fields.summary,
        description: extractDescription(data.fields.description),
        issueType: data.fields.issuetype.name,
        status: data.fields.status.name,
        project: data.fields.project.name,
        linkedIssues: extractLinkedIssueKeys(data.fields.issuelinks ?? []),
      };
    } catch (error) {
      console.log(`  Jira: error fetching ${key}: ${error} — skipping`);
    }
  }

  return result;
}
