import crypto from 'node:crypto';
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { checkoutLimiter } from '../middleware/rate-limits.js';
import { creditStatus, grantSubscription, validateCoupon } from '../services/billing.service.js';
import { sendSubscriptionEmail } from '../services/mail.service.js';

const checkoutSchema = z.object({ planId: z.string().cuid(), couponCode: z.string().trim().min(2).max(64).optional() });
const razorpayResponseSchema = z.object({ id: z.string().min(1).max(200), short_url: z.string().url().optional() });

async function subscriptionEmail(userId: string, plan: { name: string; aiCredits: number; priceInr: number }, endsAt: Date, amountInr: number) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (user) await sendSubscriptionEmail(user.email, { planName: plan.name, credits: plan.aiCredits, endsAt, amountInr });
  } catch (error) { console.error('Subscription email could not be delivered', error); }
}

export const billingRouter = Router();
billingRouter.get('/plans', async (_req, res) => {
  const plans = await prisma.subscriptionPlan.findMany({ where: { active: true, hidden: false }, orderBy: { priceInr: 'asc' }, select: { id: true, name: true, description: true, priceInr: true, durationDays: true, aiCredits: true, reportExportsEnabled: true } });
  res.json({ plans: plans.map(plan => ({ ...plan, reportExportsEnabled: plan.priceInr > 0 && plan.reportExportsEnabled })) });
});
billingRouter.get('/me', requireAuth, async (req, res) => res.json(await creditStatus(req.auth!.userId)));

billingRouter.post('/checkout', requireAuth, checkoutLimiter, async (req, res) => {
  const { planId, couponCode } = checkoutSchema.parse(req.body);
  const plan = await prisma.subscriptionPlan.findFirst({ where: { id: planId, active: true, hidden: false } });
  if (!plan) return res.status(404).json({ message: 'Plan not found' });
  const coupon = couponCode ? await validateCoupon(couponCode, req.auth!.userId, plan.id) : null;
  const payable = Math.round(plan.priceInr * (100 - (coupon?.discountPercent ?? 0)) / 100);
  if (payable === 0) {
    const subscription = await grantSubscription(req.auth!.userId, plan.id, coupon?.id);
    await subscriptionEmail(req.auth!.userId, subscription.plan, subscription.endsAt, payable);
    return res.json({ mode: 'granted', subscription });
  }
  if (coupon && !coupon.razorpayOfferId) return res.status(400).json({ message: 'This percentage coupon needs a matching Razorpay offer before it can be used for paid checkout' });
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET || !plan.razorpayPlanId) return res.status(503).json({ message: 'Online checkout is not configured for this plan yet' });
  const authorization = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const response = await fetch('https://api.razorpay.com/v1/subscriptions', {
    method: 'POST', headers: { Authorization: `Basic ${authorization}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan_id: plan.razorpayPlanId, offer_id: coupon?.razorpayOfferId, total_count: 120, customer_notify: 1, notes: { userId: req.auth!.userId, planId: plan.id, couponId: coupon?.id ?? '' } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw Object.assign(new Error('Razorpay could not start checkout'), { status: 502 });
  const razorpay = razorpayResponseSchema.parse(await response.json());
  const now = new Date();
  const subscription = await prisma.userSubscription.create({ data: { userId: req.auth!.userId, planId: plan.id, couponId: coupon?.id, status: 'PENDING', startsAt: now, endsAt: now, razorpaySubscriptionId: razorpay.id } });
  return res.json({ mode: 'razorpay', keyId: env.RAZORPAY_KEY_ID, subscriptionId: razorpay.id, shortUrl: razorpay.short_url, internalSubscriptionId: subscription.id });
});

// Mounted before JSON parsing in app.ts so Razorpay's signature covers untouched bytes.
export async function razorpayWebhook(req: import('express').Request, res: import('express').Response) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return res.status(503).send('Webhook is not configured');
  const signature = req.header('x-razorpay-signature') ?? '';
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  const expected = crypto.createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return res.status(401).send('Invalid signature');

  const payloadSchema = z.object({
    event: z.string().min(1).max(120).optional(),
    payload: z.object({ subscription: z.object({ entity: z.object({ id: z.string().min(1).max(200), current_start: z.number().int().positive().optional(), current_end: z.number().int().positive().optional() }).passthrough() }).optional(), payment: z.object({ entity: z.object({ id: z.string().min(1).max(200) }).passthrough() }).optional() }).optional(),
  });
  let payload: z.infer<typeof payloadSchema>;
  try { payload = payloadSchema.parse(JSON.parse(body.toString('utf8'))); } catch { return res.status(400).send('Invalid webhook payload'); }
  const remote = payload.payload?.subscription?.entity;
  const status = payload.event === 'subscription.activated' || payload.event === 'subscription.charged' ? 'ACTIVE' : payload.event === 'subscription.cancelled' ? 'CANCELLED' : undefined;
  const eventId = req.header('x-razorpay-event-id') || crypto.createHash('sha256').update(body).digest('hex');

  try {
    const outcome = await prisma.$transaction(async tx => {
      await tx.webhookEvent.create({ data: { provider: 'razorpay', eventId, eventType: payload.event ?? 'unknown' } });
      if (!remote || !status) return null;
      const subscription = await tx.userSubscription.findUnique({ where: { razorpaySubscriptionId: remote.id }, include: { plan: true } });
      if (!subscription) return null;
      const wasActive = subscription.status === 'ACTIVE';
      await tx.userSubscription.update({ where: { id: subscription.id }, data: { status, startsAt: remote.current_start ? new Date(remote.current_start * 1000) : subscription.startsAt, endsAt: remote.current_end ? new Date(remote.current_end * 1000) : subscription.endsAt, razorpayPaymentId: payload.payload?.payment?.entity?.id ?? subscription.razorpayPaymentId } });
      if (status === 'ACTIVE' && !wasActive && subscription.couponId) {
        await tx.couponRedemption.createMany({ data: [{ couponId: subscription.couponId, userId: subscription.userId, planId: subscription.planId }], skipDuplicates: true });
      }
      return status === 'ACTIVE' && !wasActive ? subscription : null;
    });
    if (outcome) await subscriptionEmail(outcome.userId, outcome.plan, remote?.current_end ? new Date(remote.current_end * 1000) : outcome.endsAt, outcome.plan.priceInr);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return res.status(204).send();
    throw error;
  }
  return res.status(204).send();
}
