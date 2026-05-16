# Contributing

## When OpenArt changes their UI (selectors break)

1. Run `npx playwright codegen https://openart.ai` and click through the broken flow
2. Capture the new selectors from the generated code
3. Patch the TODOs in `src/tools.ts`
4. Run `npm run build && npm run inspect` to verify
5. Open a PR with: which tool, old selector, new selector, what UI change triggered it

## Adding a new tool

1. Implement the function in `src/tools.ts` (return JSON, use Playwright for browser actions)
2. Register the tool in `src/index.ts` with input schema, description, and annotations
3. Document it in the README + `skills/openart/SKILL.md` intent table
4. Update the README tool table

## Coding standards

- TypeScript strict mode (enforced by `tsconfig.json`)
- Stdio transport only (no HTTP)
- Zod schemas for every tool input
- Each tool returns structured JSON via `structuredContent`
- Async tools must close their Playwright page in a `finally` block

## Reporting issues

Include:
- OS + Node version
- Which tool failed
- The exact error message
- Whether `npm run login` was re-run recently
- Whether you re-ran selector codegen
