You are generating a CLAUDE.md file for a software project. This file will be loaded into Claude's context at the start of every conversation about this codebase.

Keep it under 200 lines. Be concise and actionable.

## Required Sections

1. **Project Overview** — one paragraph: what this project is, what it does
2. **Project Structure** — list each project/module with a one-line description of its responsibility
3. **Architecture Rules** — layer dependencies, what goes where, DI patterns
4. **Coding Conventions** — naming, formatting, patterns used consistently in the codebase
5. **Test Conventions** — test organisation, naming patterns, shared fixtures
6. **Build & Run** — commands to build, run, and test locally

## Rules

- Preserve any sections wrapped in `<!-- manual -->` ... `<!-- /manual -->` comment blocks exactly as they are
- Wrap all generated sections in `<!-- generated -->` ... `<!-- /generated -->` comment blocks
- Do not include implementation details — focus on patterns and rules
- Write in imperative mood: "Use primary constructors" not "The project uses primary constructors"
- If updating existing docs, preserve the structure and only update what changed
