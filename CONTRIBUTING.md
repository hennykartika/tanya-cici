# Contributing

## Setup

```bash
npm install          # ESLint only; the app itself has no runtime dependencies
cp .env.example .env # set PROVIDER=mock to work without an API key
npm run dev
```

## Before opening a pull request

```bash
npm run verify   # lint + tests + secret scan, identical to CI
```

## Conventions

- ES modules, Node 20+ standard library only for runtime code.
- Comments explain *why*, not *what*; code and comments in English, user-facing copy in
  Indonesian.
- New behaviour comes with a test. Domain rules go under `test/unit`, anything touching
  routing or status codes under `test/integration`.
- Persona changes belong in `prompts/*.md`, not in source files.
- Never commit `.env` or paste an API key into an issue, a test fixture or a screenshot.
