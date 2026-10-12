import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  COOKIE_SECURE: z.preprocess(value => value === 'true', z.boolean()).default(false),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  BACKEND_URL: z.string().url().default('http://localhost:4000'),
  GOOGLE_CLIENT_ID: z.string().optional(), GOOGLE_CLIENT_SECRET: z.string().optional(), GOOGLE_CALLBACK_URL: z.string().url().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(), CLOUDINARY_API_KEY: z.string().optional(), CLOUDINARY_API_SECRET: z.string().optional(), CLOUDINARY_FOLDER: z.string().default('resource-vault/documents'), CLOUDINARY_AVATAR_FOLDER: z.string().default('snoq/avatars'),
  RESEND_API_KEY: z.string().optional(), EMAIL_FROM: z.string().min(3).optional(),
  ADMIN_EMAIL: z.string().email().optional(),
  RAZORPAY_KEY_ID: z.string().optional(), RAZORPAY_KEY_SECRET: z.string().optional(), RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(), TWILIO_AUTH_TOKEN: z.string().optional(), TWILIO_FROM_NUMBER: z.string().optional(),
  AI_PRIMARY_PROVIDER: z.enum(['gemini', 'openrouter']).default('gemini'), AI_FALLBACK_PROVIDER: z.enum(['gemini', 'openrouter']).optional(),
  GEMINI_API_KEY: z.string().optional(), GEMINI_MODEL: z.string().default('gemini-3.6-flash'), OPENROUTER_API_KEY: z.string().optional(), OPENROUTER_MODEL: z.string().default('google/gemini-3.5-flash-lite'),
  API_RATE_LIMIT_MAX: z.coerce.number().int().min(50).max(10_000).default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(3).max(100).default(10),
  PASSWORD_RESET_RATE_LIMIT_MAX: z.coerce.number().int().min(2).max(50).default(5),
  AI_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(500).default(20),
  CHECKOUT_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100).default(10),
  PUBLIC_ACCESS_REQUEST_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100).default(10),
  BROADCAST_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(25).default(3),
  REPORT_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100).default(20),
  USER_EXPORT_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(50).default(5),
}).superRefine((value, context) => {
  if (value.NODE_ENV !== 'production') return;
  if (!value.COOKIE_SECURE) context.addIssue({ code: z.ZodIssueCode.custom, path: ['COOKIE_SECURE'], message: 'COOKIE_SECURE must be true in production' });
  if (new URL(value.FRONTEND_URL).protocol !== 'https:') context.addIssue({ code: z.ZodIssueCode.custom, path: ['FRONTEND_URL'], message: 'FRONTEND_URL must use HTTPS in production' });
  if (new URL(value.BACKEND_URL).protocol !== 'https:') context.addIssue({ code: z.ZodIssueCode.custom, path: ['BACKEND_URL'], message: 'BACKEND_URL must use HTTPS in production' });
});

const parsed = envSchema.parse(process.env);
export const env = { ...parsed, FRONTEND_ORIGIN: new URL(parsed.FRONTEND_URL).origin };
