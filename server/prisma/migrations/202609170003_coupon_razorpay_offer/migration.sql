ALTER TABLE "Coupon" ADD COLUMN "razorpayOfferId" TEXT;
CREATE UNIQUE INDEX "Coupon_razorpayOfferId_key" ON "Coupon"("razorpayOfferId");
