# Architecture

## Layers

```
api/chat.js          src/server.js
  (Vercel)             (local HTTP server)
        \                 /
         └── src/app ────┘        transport: routing, headers, limits, error mapping
                │
         src/services              application flow: validate → build prompt → call model
                │
    ┌───────────┴───────────┐
src/domain              src/providers      rules that do not know about HTTP / vendor SDKs
(conversation,          (gemini, mock)
 persona)
```

Dependencies point inwards only. `src/domain` imports nothing from `src/app`, which is what
allows the domain rules to be tested without a server and the HTTP layer to be tested
without a network call.

## Composition root

`src/container.js` is the only place where concrete implementations are chosen. Both entry
points build the same container, and tests build it with overrides:

```js
const container = createContainer(undefined, { config, provider: fakeProvider, logger });
```

This is why the integration tests can exercise the real routing, validation, rate limiting
and error handling without touching the Gemini API.

## Request lifecycle

1. `createApp` assigns a request id, sets security headers and routes the request.
2. `routes/chat.js` rejects non-POST methods, cross-origin browser calls and clients over
   their quota, then reads the body with a byte ceiling.
3. `domain/conversation.js` validates and normalizes the payload: roles are mapped, text is
   sanitized and truncated, history is windowed, consecutive turns are merged, and the last
   turn must come from the user.
4. `services/chat-service.js` builds the system prompt for the requested vibe and calls the
   provider.
5. `providers/gemini.js` performs the HTTP call, retries transient overload with
   backoff inside an overall deadline, falls back to the second model, strips reasoning
   parts from the answer and maps failures to a typed `ProviderError`.
6. Errors bubble up to `createApp`, which logs them with a stack and returns only the
   error's `publicMessage`.

## Decisions

**No web framework.** The surface is two endpoints and a static directory. The standard
library covers it, the dependency tree stays empty, and there is no supply-chain risk for a
project whose main risk is an API key.

**Prompts as files, not string literals.** `prompts/*.md` are content, and reviewing a
persona change should look like reviewing text. `createPersona` hashes the files into a
short `version` that is logged with every request, so a log line can be traced back to the
exact prompt that produced it.

**A provider interface with two implementations.** `generate({ systemPrompt, messages })` is
all the application needs. `mock` makes the UI workable offline and keeps tests
deterministic and free; swapping in another vendor means adding one file.

**Errors carry a public message.** `AppError` separates the internal message (logged) from
`publicMessage` (returned). A response can therefore never leak upstream text, and the user
still gets something readable in Indonesian.

**Validation lives in the domain, not in the route.** The route is an adapter; the rules
about what a conversation may look like are testable on their own.

## Frontend

`public/js` is split by responsibility: `api.js` (transport), `storage.js` (persistence),
`markdown.js` (rendering the small Markdown subset the persona may emit), `ui.js` (DOM
construction), `effects.js` (motion), `content.js` (copy), `main.js` (state and wiring).

`markdown.js` is imported by the Node test suite as well, so the escaping rules are covered
by tests even though there is no browser test runner in the project.

## Extension points

- **Another model vendor:** add `src/providers/<vendor>.js` and register it in
  `src/providers/index.js`.
- **Another persona or language:** add `prompts/<name>.md` files and extend
  `src/domain/persona.js`.
- **Shared rate limiting:** replace `src/app/rate-limiter.js` with an implementation backed
  by a shared store; the interface is a single `check(key)` call.
