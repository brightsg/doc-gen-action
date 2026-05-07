# doc-gen-action

A reusable GitHub Action that auto-generates and maintains documentation for your codebase using the Claude API. Produces AI-focused reference docs (CLAUDE.md), human-readable docs, and changelogs enriched with Jira ticket context.

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `anthropic-api-key` | Anthropic API key for Claude | Yes | - |
| `github-token` | GitHub token with repo write + dispatch permissions | Yes | - |
| `docs-repo` | Target docs site repo (e.g. `brightsg/autodoc-test`) | Yes | - |
| `repo-name` | Identifier for this repo in the docs site | Yes | - |
| `claude-model` | Claude model to use | No | `claude-sonnet-4-6` |
| `project-type` | Project type(s) — comma-separated. Valid: `api`, `worker`, `sdk`, `frontend`, `cli` | No | - |
| `human-doc-types` | Override: explicit comma-separated doc types (takes precedence over project-type) | No | - |
| `claude-md-path` | Path for the lightweight AI doc | No | `CLAUDE.md` |
| `claude-md-verbose-path` | Path for the detailed AI doc | No | `CLAUDE-VERBOSE.md` |
| `force-generate` | Skip change detection and force full generation | No | `false` |
| `jira-api-token` | Jira API token for enriching changelogs with ticket details | No | - |
| `jira-user-email` | Email for Jira basic auth (paired with jira-api-token) | No | - |
| `jira-host` | Jira instance hostname (e.g. `brightsg.atlassian.net`) | No | - |

## Doc Types

### Shared (generated for all project types)
- **architecture** — System overview, dependencies, design patterns
- **onboarding** — Getting started guide, prerequisites, setup
- **release-notes** — Release notes from git history (append mode)
- **changelog-internal** — Technical changelog with full detail, Jira enrichment (append mode)
- **changelog-external** — Customer-friendly changelog, positive framing, no technical terms (append mode)

### Project-type specific
- **api** → `api` (API documentation)
- **worker** → `worker` (Background service/message handler docs)
- **sdk** → `sdk-usage` (SDK consumer guide)
- **frontend** → `frontend-usage` (Frontend application guide)
- **cli** → `cli-reference` (CLI command reference)

## Jira Integration

When `jira-api-token`, `jira-user-email`, and `jira-host` are all provided, the action:

1. Extracts Jira ticket keys from commit messages (e.g. `BPOLUK-1965`, `TRI-12615`)
2. Fetches full ticket details from the Jira REST API
3. Includes ticket summaries, descriptions, issue types, and linked issues as context for Claude

If Jira credentials are not provided, changelogs still generate from git history alone.

## How AI docs land on the consuming repo

`CLAUDE.md` and `CLAUDE-VERBOSE.md` are committed back to the consuming repo using a try-direct-then-fall-back-to-PR strategy:

1. The action commits the regenerated docs and tries to push directly to `main`.
2. If the push is accepted, the docs land on `main` immediately — no PR is opened.
3. If the push is rejected (typically by branch protection or a ruleset that the action's `github-token` actor cannot bypass), the action pushes the commit to a `docs/auto-update-<timestamp>` branch and opens a PR against `main`.

To get direct-push behaviour, add the `github-token`'s actor (or a role/team it belongs to) to your branch ruleset's bypass list. Deploy keys in the bypass list have no effect here because the action authenticates over HTTPS with a token, not via SSH.

## Usage

```yaml
name: Generate Docs

on:
  push:
    branches: [main]

jobs:
  generate-docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Generate documentation
        uses: brightsg/doc-gen-action@v1
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
          docs-repo: brightsg/autodoc-test
          repo-name: my-service
          project-type: api
          jira-api-token: ${{ secrets.JIRA_API_TOKEN }}
          jira-user-email: ${{ secrets.JIRA_USER_EMAIL }}
          jira-host: brightsg.atlassian.net
```

## Development

```bash
npm install
npm run build
npm test
```
