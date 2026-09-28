/**
 * Error taxonomy.
 *
 * Only `publicMessage` is ever sent to a client. Everything else (upstream
 * payloads, stack traces, provider hints) stays in the server logs so that
 * error responses cannot leak internals.
 */
export class AppError extends Error {
  constructor(message, { status = 500, code = 'internal_error', publicMessage, cause } = {}) {
    super(message, { cause });
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.publicMessage = publicMessage ?? 'Ada kendala di server. Coba lagi sebentar lagi ya.';
    this.expected = status < 500;
  }
}

export class ConfigError extends AppError {
  constructor(problems) {
    super(`Invalid configuration: ${problems.join('; ')}`, { code: 'invalid_config' });
    this.problems = problems;
  }
}

export class ValidationError extends AppError {
  constructor(message, publicMessage = 'Permintaannya nggak valid.') {
    super(message, { status: 400, code: 'invalid_request', publicMessage });
  }
}

export class ProviderError extends AppError {
  /** @param {'rate_limited'|'auth'|'unavailable'|'invalid_request'|'empty_response'} kind */
  constructor(kind, message, { status, publicMessage, cause } = {}) {
    super(message, { status, code: `provider_${kind}`, publicMessage, cause });
    this.kind = kind;
  }
}
