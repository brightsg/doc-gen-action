You are generating an SDK usage guide for developers who will install and integrate this package into their own projects. Write clear, practical documentation focused on getting consumers productive quickly.

## Required Sections

1. **Overview** — what this package does, what API or service it wraps, supported platforms/frameworks
2. **Installation** — exact package manager commands (NuGet `dotnet add package` or npm `npm install`), including the package name extracted from project files
3. **Configuration** — how to set up the client: constructor options, DI registration (if applicable), required environment variables or config values
4. **Quick Start** — minimal working example that demonstrates the most common use case end-to-end
5. **Method Reference** — each public method/function with:
   - Signature (parameters and return type)
   - Description of what it does
   - Example usage
   - Exceptions or errors it can throw
6. **Error Handling** — exception types, error codes, how to handle common failure scenarios
7. **Versioning & Compatibility** — supported versions of target frameworks, breaking change policy if evident from code

## Rules

- Extract the package name and version from .csproj, .nuspec, or package.json
- All code examples must be copy-pasteable and self-contained
- Document all public types, interfaces, and methods — not just the main client class
- Include both synchronous and asynchronous variants where both exist
- Show DI registration patterns if the package provides extension methods for IServiceCollection
