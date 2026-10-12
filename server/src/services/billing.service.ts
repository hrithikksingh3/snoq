import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

const addDays=(date:Date,days:number)=>new Date(date.getTime()+days*86_400_000);

export type ActiveEntitlement={id:string;startsAt:Date;endsAt:Date;plan:{id:string;name:string;aiCredits:number;priceInr:number;durationDays:number;reportExportsEnabled:boolean}};

export async function activeEntitlement(userId:string):Promise<ActiveEntitlement|null>{
  return prisma.userSubscription.findFirst({where:{userId,status:'ACTIVE',endsAt:{gt:new Date()}},orderBy:{endsAt:'desc'},include:{plan:{select:{id:true,name:true,aiCredits:true,priceInr:true,durationDays:true,reportExportsEnabled:true}}}});
}

export async function ensureEntitlement(userId:string):Promise<ActiveEntitlement>{
  const current=await activeEntitlement(userId); if(current)return current;
  const free=await prisma.subscriptionPlan.findFirst({where:{priceInr:0,active:true},orderBy:{createdAt:'asc'}});
  if(!free) throw Object.assign(new Error('No complimentary plan is configured yet'),{status:503});
  const now=new Date();
  return prisma.userSubscription.create({data:{userId,planId:free.id,status:'ACTIVE',startsAt:now,endsAt:addDays(now,free.durationDays)},include:{plan:{select:{id:true,name:true,aiCredits:true,priceInr:true,durationDays:true,reportExportsEnabled:true}}}});
}

export async function creditStatus(userId:string){
  const subscription=await ensureEntitlement(userId);
  const usage=await prisma.aiUsage.findUnique({where:{userId_periodStart:{userId,periodStart:subscription.startsAt}}});
  const plan={...subscription.plan,reportExportsEnabled:subscription.plan.priceInr>0&&subscription.plan.reportExportsEnabled};
  return {plan,subscription:{id:subscription.id,startsAt:subscription.startsAt,endsAt:subscription.endsAt},used:usage?.count??0,remaining:Math.max(0,subscription.plan.aiCredits-(usage?.count??0))};
}

export async function consumeAiCredit(userId:string){
  const subscription=await ensureEntitlement(userId);
  return prisma.$transaction(async tx=>{
    const usage=await tx.aiUsage.findUnique({where:{userId_periodStart:{userId,periodStart:subscription.startsAt}}});
    if((usage?.count??0)>=subscription.plan.aiCredits) throw Object.assign(new Error(`Your ${subscription.plan.name} plan has used all ${subscription.plan.aiCredits} AI assists for this period`),{status:402});
    const updated=await tx.aiUsage.upsert({where:{userId_periodStart:{userId,periodStart:subscription.startsAt}},create:{userId,subscriptionId:subscription.id,periodStart:subscription.startsAt,count:1},update:{count:{increment:1}}});
    return {used:updated.count,remaining:Math.max(0,subscription.plan.aiCredits-updated.count),plan:subscription.plan.name};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}

export async function validateCoupon(code:string,userId:string,planId:string){
  const normalized=code.trim().toUpperCase(); const now=new Date();
  const coupon=await prisma.coupon.findUnique({where:{code:normalized},include:{_count:{select:{redemptions:true}}}});
  if(!coupon||!coupon.active||coupon.validFrom>now||(coupon.validUntil&&coupon.validUntil<now)) throw Object.assign(new Error('This coupon is invalid or expired'),{status:400});
  if(coupon.planId&&coupon.planId!==planId) throw Object.assign(new Error('This coupon is not available for the selected plan'),{status:400});
  if(coupon.maxRedemptions!==null&&coupon._count.redemptions>=coupon.maxRedemptions) throw Object.assign(new Error('This coupon has reached its redemption limit'),{status:400});
  if(await prisma.couponRedemption.findUnique({where:{couponId_userId:{couponId:coupon.id,userId}}})) throw Object.assign(new Error('You have already used this coupon'),{status:400});
  return coupon;
}

export async function grantSubscription(userId:string,planId:string,couponId?:string){
  const plan=await prisma.subscriptionPlan.findFirst({where:{id:planId,active:true}}); if(!plan)throw Object.assign(new Error('The selected plan is unavailable'),{status:404});
  const coupon=couponId?await prisma.coupon.findUnique({where:{id:couponId}}):null;
  const now=new Date(); const duration=coupon?.grantDays??plan.durationDays;
  return prisma.$transaction(async tx=>{
    await tx.userSubscription.updateMany({where:{userId,status:'ACTIVE',endsAt:{gt:now}},data:{status:'CANCELLED'}});
    const subscription=await tx.userSubscription.create({data:{userId,planId:plan.id,status:'ACTIVE',startsAt:now,endsAt:addDays(now,duration)},include:{plan:true}});
    if(coupon) await tx.couponRedemption.create({data:{couponId:coupon.id,userId,planId:plan.id}});
    return subscription;
  });
}

export function generateCouponCode(){return `SNOQ-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;}
