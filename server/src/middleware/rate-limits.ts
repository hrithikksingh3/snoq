import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const common = {
  standardHeaders: 'draft-8' as const,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please wait and try again.' },
};

export const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: env.API_RATE_LIMIT_MAX, ...common });
export const credentialLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: env.AUTH_RATE_LIMIT_MAX, ...common });
export const passwordResetLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: env.PASSWORD_RESET_RATE_LIMIT_MAX, ...common });
export const aiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: env.AI_RATE_LIMIT_MAX, ...common });
export const checkoutLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: env.CHECKOUT_RATE_LIMIT_MAX, ...common });
export const publicAccessRequestLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: env.PUBLIC_ACCESS_REQUEST_RATE_LIMIT_MAX, ...common });
export const broadcastLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: env.BROADCAST_RATE_LIMIT_MAX, ...common });
export const reportLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: env.REPORT_RATE_LIMIT_MAX, ...common });
export const userExportLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: env.USER_EXPORT_RATE_LIMIT_MAX, ...common });
