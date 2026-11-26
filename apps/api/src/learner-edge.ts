import { posix } from 'node:path';
import type { NextFunction, Request, Response } from 'express';

/**
 * Learner-host edge marker. Caddy's learner site sets `X-Edge: learner` on every request it
 * proxies to the API (overwriting any client value); the Studio site strips it. The API container
 * is reachable only through Caddy (no published port), so the header cannot be forged from outside.
 */
export const EDGE_HEADER = 'x-edge';
export const EDGE_LEARNER = 'learner';

/** Staff-only API surface: admin, manager and the HTTP docs (Swagger UI, docs-json/yaml, OpenAPI). */
const STAFF = /^\/api\/v1\/(admin|manager|docs|openapi)/;

/** One form of the path: lowercased, repeated slashes merged, dot segments resolved. */
const clean = (p: string) => posix.normalize(p.toLowerCase().replace(/\/{2,}/g, '/'));

/**
 * True when the request path names (or could be routed to) a staff route. Express routes on the
 * raw path, so the raw form is decisive; the decoded form is checked too, in case any hop decodes.
 */
export function isStaffPath(rawPath: string): boolean {
  const forms = [rawPath];
  try {
    forms.push(decodeURIComponent(rawPath));
  } catch {
    // Malformed escapes: decode what can be decoded, leave the rest as is.
    forms.push(
      rawPath.replace(/(%[0-9a-f]{2})+/gi, (m) => {
        try {
          return decodeURIComponent(m);
        } catch {
          return m;
        }
      }),
    );
  }
  return forms.some((p) => STAFF.test(p.toLowerCase()) || STAFF.test(clean(p)));
}

/** Route that no controller declares: it falls through to Nest's own not-found handler. */
const UNROUTABLE = '/api/v1/-';

/**
 * Express middleware, mounted after the body parser and before any route (including Swagger):
 * on the learner edge a staff path is re-pointed at an unroutable URL, so Nest answers it with its
 * own not-found handler. That handler reports `req.originalUrl`, which this does not touch, so the
 * response is exactly what a path that does not exist gets (`Cannot <METHOD> <original URL>`).
 */
export function learnerEdge(req: Request, _res: Response, next: NextFunction) {
  if (req.headers[EDGE_HEADER] === EDGE_LEARNER && isStaffPath(req.path)) req.url = UNROUTABLE;
  next();
}
