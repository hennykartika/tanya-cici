# Security notes

## What this application is

A public, anonymous chat page in front of a third-party LLM API. There is no database, no
user account, no file upload and no privileged area. That shapes the whole threat model:
the assets worth protecting are **the API key**, **the API quota attached to it**, and
**the browser of whoever opens the page**.

## Threat model

| Threat | Control |
| --- | --- |
| API key theft | Key is server side only, never sent to the browser, never logged, redacted from upstream error text |
| Quota abuse by third-party sites | JSON-only content type (forces a CORS preflight that is never answered) plus an `Origin` allow list |
| Quota abuse by a single client | Per-client sliding-window rate limit, bounded in memory |
| Resource exhaustion | Body size ceiling, request/header timeouts, capped history window and output tokens |
| XSS through model or user text | Output is escaped before any markup is added, a strict CSP without `unsafe-inline`, user text set via `textContent` |
| Information disclosure through errors | Two-part error objects: internal message logged, `publicMessage` returned |
| Path traversal in the static server | Path resolved and re-checked after `realpath`, extension allow list |
| Prompt injection | System prompt states that user messages are content and not instructions; output is treated as plain text and never executed |
| Privacy of conversations | Nothing stored server side; the UI warns that free-tier prompts reach Google |

## Checklist review

The list below is the common pre-release checklist for a web app, applied to this project.
Items are marked "n/a" only where the corresponding feature does not exist; that is a
consequence of the design, not an accepted risk.

| # | Item | Status | Where / why |
| --- | --- | --- | --- |
| 1 | API key handled safely | Applied | Read from the environment in `src/config.js`, used only in `src/providers/gemini.js`, redacted in logs and error text (`scrub()`), never part of any response |
| 2 | `.env` not public | Applied | `.gitignore` excludes `.env*` except the example; the static server refuses unknown extensions so a stray copy in `public/` is still not served |
| 3 | No hardcoded secrets | Applied | No literals in source; `loadConfig` fails fast when `GEMINI_API_KEY` is missing |
| 4 | Secrets checked before pushing | Applied | `npm run scan:secrets` (`scripts/scan-secrets.js`) runs in CI; enable GitHub secret scanning and push protection on the repository as well |
| 5 | Debug mode off | Applied | No debug flag ships enabled: `LOG_LEVEL` defaults to `info`, stack traces go to the log only, `/healthz` exposes no configuration |
| 6 | Errors do not leak internals | Applied | `AppError.publicMessage` is the only text returned; upstream messages and stacks stay server side (covered by tests in `test/integration/http.test.js`) |
| 7 | Input validation | Applied | `src/domain/conversation.js` validates types, roles, sizes and counts; `readJsonBody` enforces content type and byte limits |
| 8 | Input sanitization | Applied | `sanitizeText` strips control characters and bidirectional overrides, normalizes Unicode and truncates |
| 9 | SQL injection | n/a | No database and no query language anywhere in the project. The analogous risk here is prompt injection, handled as described above |
| 10 | XSS | Applied | `public/js/markdown.js` escapes before rendering a fixed tag subset; user text uses `textContent`; CSP has no `unsafe-inline` and no `unsafe-eval` |
| 11 | Server-side authentication | n/a by design | The app is a public demo with no accounts. Abuse controls replace authentication. If you deploy it for a closed group, put it behind an access proxy or add a shared credential in front of `/api/chat` |
| 12 | Per-user access checks | n/a | No user-owned resources exist; every request is anonymous and stateless |
| 13 | Admin roles | n/a | No admin surface. The UI entry dialog is cosmetic: `guest` only changes the persona's tone and grants nothing |
| 14 | Database not publicly reachable | n/a | No database. Conversation history lives in the visitor's own `localStorage` |
| 15 | Least-privilege database permissions | n/a | See above |
| 16 | Password hashing | n/a | No passwords are collected or stored |
| 17 | Session security | n/a | No sessions and no cookies; the server keeps no per-visitor state beyond an in-memory rate-limit counter |
| 18 | Password reset flow | n/a | No credentials, so no reset flow |
| 19 | Upload limits | Applied (as body limits) | No file upload endpoint exists; request bodies are capped by `MAX_BODY_BYTES` and only `application/json` is accepted |
| 20 | Upload scanning | n/a | Nothing is uploaded or stored |

## Controls not on that list

- **Security headers** on every response (`src/app/security-headers.js`): CSP, `nosniff`,
  `DENY` framing, `no-referrer`, a restrictive `Permissions-Policy`, and HSTS when the
  request arrives over TLS. `vercel.json` repeats them for statically served files.
- **Timeouts** on both sides: `AbortSignal.timeout` for the upstream call, and
  `headersTimeout` / `requestTimeout` / `keepAliveTimeout` on the server to drop slow
  connections.
- **Proxy trust is explicit.** `X-Forwarded-For` is only honoured when `TRUST_PROXY=true`,
  so a spoofed header cannot bypass the rate limit on a directly exposed server.
- **Bounded memory.** The rate limiter prunes expired entries and evicts the oldest key
  instead of clearing the whole map, so one noisy client cannot reset everyone's counters.
- **No runtime dependencies**, which removes the largest supply-chain surface. The only
  dev dependency is ESLint, and Dependabot watches it.
- **Logging excludes conversation content.** Only metadata is logged (request id, model,
  latency, token counts, reply length), and known credential-like keys are redacted.

## Privacy

Prompts are sent to Google's Gemini API. On the free tier, Google's API terms state that
submitted content is used to improve their products and that human reviewers may read it
after it has been disconnected from the account, API key and project. The UI therefore
tells visitors not to send personal data, and no conversation is stored on the server.
A paid tier changes that data usage; see Google's current terms before deploying this for
anyone but yourself.

## Operational guidance

- Rotate the API key if it ever reaches a shared channel, a screenshot or a commit.
- Keep `HOST=127.0.0.1` locally; use `0.0.0.0` only when you intend to expose the server.
- When deploying publicly, set `ALLOWED_ORIGINS` to your own domain and consider lowering
  `RATE_LIMIT_PER_MIN`.
- Enable branch protection plus secret scanning on the GitHub repository.

## Reporting

Open a private security advisory on the repository rather than a public issue.
