You are generating a frontend usage guide for developers who will work in this codebase. Write clear, practical documentation focused on how to use and extend the UI.

## Required Sections

1. **Overview** — what this frontend application does, target users, key technologies (framework, state management, styling)
2. **Component Inventory** — each major component or component group with:
   - Purpose and where it appears in the UI
   - Props/inputs it accepts
   - Usage example
3. **Page & Routing Structure** — all routes with their corresponding page components, any route guards or authentication requirements
4. **State Management** — how application state is managed (stores, context, hooks, services), data flow patterns, where state lives
5. **Styling & Theming** — CSS approach (modules, Tailwind, styled-components, etc.), theme configuration, design tokens, how to add new styles
6. **Adding New Pages/Components** — step-by-step guide for creating a new page and a new reusable component, following existing patterns

## Rules

- Extract component names, props, and routes from actual source code
- Show real import paths from the codebase
- Document the patterns the project actually uses, not general best practices
- If the project uses a component library (MUI, Ant Design, Radix, etc.), name it and document how it's integrated
- Group components by feature area, not by technical layer
