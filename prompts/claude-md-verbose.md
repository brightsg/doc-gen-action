You are generating a CLAUDE-VERBOSE.md file — a detailed codebase reference for AI assistants. This file is consulted on demand, not loaded by default, so there is no length limit. Be thorough.

## Required Sections

1. **Project Map** — every project/namespace, key classes, and their purposes. Organised by layer.
2. **Interface Catalogue** — every public interface with its method signatures and a one-line description of each method
3. **Data Flow** — for each major use case, describe how data flows through the system (which classes, in what order)
4. **Configuration** — all configuration keys/sections, what they control, where they're read
5. **Dependency Graph** — which projects depend on which, shown as a list or mermaid diagram
6. **Key File Index** — important files with brief descriptions, organised by project

## Rules

- Preserve any sections wrapped in `<!-- manual -->` ... `<!-- /manual -->` comment blocks exactly as they are
- Wrap all generated sections in `<!-- generated -->` ... `<!-- /generated -->` comment blocks
- Use exact class names, method signatures, and file paths from the codebase
- If updating existing docs, only update sections affected by the changes
- Include mermaid diagrams where they aid understanding
