import fs from 'node:fs/promises';
import path from 'node:path';

const CONTENT_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff2', 'font/woff2'],
]);

/**
 * Static file handler for `public/`.
 *
 * Path traversal is blocked twice: once on the resolved path and once on the
 * real path, so a symlink cannot point outside the served directory either.
 * Only known extensions are served, which keeps stray files (an .env copied
 * into public/, an editor backup) unreachable.
 */
export function createStaticHandler({ root }) {
  return async function serveStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;

    let decodedPath;
    try {
      decodedPath = decodeURIComponent(url.pathname);
    } catch {
      return false;
    }

    const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
    const resolved = path.resolve(root, relativePath);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) return false;

    const contentType = CONTENT_TYPES.get(path.extname(resolved).toLowerCase());
    if (!contentType) return false;

    let realPath;
    let stats;
    try {
      realPath = await fs.realpath(resolved);
      if (realPath !== root && !realPath.startsWith(root + path.sep)) return false;
      stats = await fs.stat(realPath);
      if (!stats.isFile()) return false;
    } catch {
      return false;
    }

    const etag = `W/"${stats.size.toString(16)}-${stats.mtimeMs.toString(16)}"`;
    const headers = {
      'content-type': contentType,
      etag,
      // HTML is revalidated so a deploy is picked up immediately; assets are
      // small and change together with it, so a short TTL is enough.
      'cache-control': contentType.startsWith('text/html') ? 'no-cache' : 'public, max-age=3600',
    };

    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      res.end();
      return true;
    }

    const body = await fs.readFile(realPath);
    res.writeHead(200, { ...headers, 'content-length': body.length });
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  };
}
