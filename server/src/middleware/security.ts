import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * API-only response headers. The static frontend owns its page CSP; this keeps
 * API responses from being embedded or content-sniffed without interfering
 * with the browser's cross-origin fetches to the API.
 */
export function apiSecurityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('Content-Security-Policy', "default-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
  if (env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

/**
 * The application authenticates with an HttpOnly cookie. When browsers send an
 * Origin header for a mutating request, require it to be the configured web
 * application origin. Requests without an Origin header are retained for
 * non-browser clients and Razorpay's separately authenticated webhook.
 */
export function csrfOriginGuard(req: Request, res: Response, next: NextFunction) {
  if (!unsafeMethods.has(req.method)) return next();
  const origin = req.get('origin');
  if (!origin || origin === env.FRONTEND_ORIGIN) return next();
  return res.status(403).json({ message: 'Request origin is not allowed' });
}
