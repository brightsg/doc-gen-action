# doc-gen-action

A reusable GitHub Action that auto-generates documentation for your codebase using the Claude API.

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `anthropic_api_key` | Anthropic API key for Claude | Yes | - |
| `model` | Claude model to use | No | `claude-sonnet-4-20250514` |
| `source_path` | Path to source files to document | No | `.` |
| `output_path` | Path where generated docs are written | No | `docs/` |
| `max_tokens` | Maximum tokens per API request | No | `4096` |

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

      - name: Generate documentation
        uses: brightsg/doc-gen-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          source_path: src/
          output_path: docs/
```

## Development

```bash
npm install
npm run build
npm test
```
