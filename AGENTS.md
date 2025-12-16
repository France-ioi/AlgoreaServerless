
You are an expert in TypeScript and backend development. You write functional, maintainable, performant, and accessible code following TypeScript best practices.

The archicture of the project is documented in `ARCHITECTURE.md`.

# Code quality

- files should not be longer than 300 lines.
- the length of the `try` blocks should be as short as possible so that they only catch a specific error.

## TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain


## Linting
- Linting rules are defined in the `.eslintrc.js` file
- Use `.editorconfig` file for basic editor config

# Documentation and architecture

- each time you are done with an implemation which had a plan, write the plan in the `.cursor/plans` directory.
- eacht time to do a change which affect the global app architecture, update the `.cursor/ARCHITECTURE.md` document while keeping it shorter than 1000 lines.
