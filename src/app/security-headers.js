// The page loads its own scripts and styles only; Google Fonts is the single
// third party and is allow-listed explicitly. No 'unsafe-inline' anywhere, so a
// stray injected <script> or style attribute will not execute.
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

export const SECURITY_HEADERS = Object.freeze({
  'content-security-policy': CONTENT_SECURITY_POLICY,
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
});

export function applySecurityHeaders(res, { https = false } = {}) {
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(header, value);
  }
  if (https) {
    res.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains');
  }
}
