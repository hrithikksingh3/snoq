-- Report downloads and emailed PDF reports are a configurable paid-plan entitlement.
ALTER TABLE "SubscriptionPlan" ADD COLUMN "reportExportsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Preserve the intended offering for existing plans: paid plans include reports; the complimentary plan does not.
UPDATE "SubscriptionPlan" SET "reportExportsEnabled" = true WHERE "priceInr" > 0;
