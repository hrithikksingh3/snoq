-- Configurable plans, user entitlements, payments, and admin controls.
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'EXPIRED', 'PENDING');
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'PAID', 'FAILED', 'REFUNDED');

ALTER TABLE "User" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER';
ALTER TABLE "User" ADD COLUMN "isSuspended" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "SubscriptionPlan" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT,
  "priceInr" INTEGER NOT NULL, "durationDays" INTEGER NOT NULL DEFAULT 30,
  "aiCredits" INTEGER NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true,
  "hidden" BOOLEAN NOT NULL DEFAULT false, "razorpayPlanId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SubscriptionPlan_name_key" ON "SubscriptionPlan"("name");
CREATE UNIQUE INDEX "SubscriptionPlan_razorpayPlanId_key" ON "SubscriptionPlan"("razorpayPlanId");

CREATE TABLE "UserSubscription" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "planId" TEXT NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
  "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL,
  "razorpaySubscriptionId" TEXT, "razorpayPaymentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserSubscription_razorpaySubscriptionId_key" ON "UserSubscription"("razorpaySubscriptionId");
CREATE UNIQUE INDEX "UserSubscription_razorpayPaymentId_key" ON "UserSubscription"("razorpayPaymentId");
CREATE INDEX "UserSubscription_userId_status_endsAt_idx" ON "UserSubscription"("userId", "status", "endsAt");

CREATE TABLE "AiUsage" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "subscriptionId" TEXT,
  "periodStart" TIMESTAMP(3) NOT NULL, "count" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiUsage_userId_periodStart_key" ON "AiUsage"("userId", "periodStart");

CREATE TABLE "Coupon" (
  "id" TEXT NOT NULL, "code" TEXT NOT NULL, "discountPercent" INTEGER NOT NULL,
  "planId" TEXT, "grantDays" INTEGER, "maxRedemptions" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true, "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validUntil" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

CREATE TABLE "CouponRedemption" (
  "id" TEXT NOT NULL, "couponId" TEXT NOT NULL, "userId" TEXT NOT NULL, "planId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CouponRedemption_couponId_userId_key" ON "CouponRedemption"("couponId", "userId");

CREATE TABLE "Payment" (
  "id" TEXT NOT NULL, "subscriptionId" TEXT NOT NULL, "amountInr" INTEGER NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED', "razorpayOrderId" TEXT,
  "razorpayPaymentId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Payment_razorpayOrderId_key" ON "Payment"("razorpayOrderId");
CREATE UNIQUE INDEX "Payment_razorpayPaymentId_key" ON "Payment"("razorpayPaymentId");

ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "UserSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "UserSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "SubscriptionPlan" ("id", "name", "description", "priceInr", "durationDays", "aiCredits", "active", "hidden", "createdAt", "updatedAt") VALUES
  ('plan_free', 'Free', 'A small monthly allowance to try SNOQ.', 0, 30, 5, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plan_starter', 'Starter', 'For light personal research.', 29, 30, 30, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plan_growth', 'Growth', 'For consistent knowledge work.', 49, 30, 90, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('plan_pro', 'Pro', 'For high-volume research workflows.', 69, 30, 120, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
