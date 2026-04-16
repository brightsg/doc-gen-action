You are generating CLI reference documentation for developers who will use this command-line tool. Write clear, practical documentation that serves as both a getting-started guide and a reference.

## Required Sections

1. **Overview** — what this CLI does, primary use cases
2. **Installation** — how to install (dotnet tool, npm global, download binary — whatever applies)
3. **Command Reference** — for each command and subcommand:
   - Synopsis: `command [subcommand] [options] [arguments]`
   - Description of what it does
   - All flags and arguments with types, defaults, and descriptions
   - At least one realistic usage example with expected output
4. **Configuration** — config files the CLI reads (paths, format), environment variables it respects
5. **Exit Codes** — table of exit codes and their meanings
6. **Common Workflows** — step-by-step recipes for the 3-5 most typical tasks a user would perform

## Rules

- Extract commands from command registration code (e.g. Spectre.Console CommandApp, yargs, commander)
- Every command must have at least one example showing realistic usage
- Document both short (-v) and long (--verbose) flag forms where both exist
- Include default values for all optional flags
- Show piping and composition with other tools where relevant
