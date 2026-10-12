import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { authRouter } from './routes/auth.routes.js';
import { resourcesRouter } from './routes/resources.routes.js';
import { listsRouter } from './routes/lists.routes.js';
import { sharesRouter } from './routes/shares.routes.js';
import { metaRouter } from './routes/meta.routes.js';
import { billingRouter, razorpayWebhook } from './routes/billing.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { exportsRouter } from './routes/exports.routes.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { apiLimiter } from './middleware/rate-limits.js';
import { apiSecurityHeaders, csrfOriginGuard } from './middleware/security.js';

export const app = express();
app.set('trust proxy', 1);
app.use(pinoHttp({ enabled: env.NODE_ENV !== 'test', redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'] }));
app.use(apiSecurityHeaders);
app.use(cors({
  origin(origin, callback) { callback(null, !origin || origin === env.FRONTEND_ORIGIN); },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  maxAge: 600,
}));
// This route must remain before JSON parsing: the provider signature covers raw bytes.
app.post('/api/billing/webhook', express.raw({ type: 'application/json', limit: '256kb' }), razorpayWebhook);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/api', csrfOriginGuard, apiLimiter);
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/shared', sharesRouter);
app.use('/api/resources', resourcesRouter);
app.use('/api/lists', listsRouter);
app.use('/api/billing', billingRouter);
app.use('/api/admin', adminRouter);
app.use('/api/exports', exportsRouter);
app.use('/api', metaRouter);
app.use(notFound);
app.use(errorHandler);
