import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { generateCouponCode } from '../services/billing.service.js';
import { sendCouponAnnouncementEmail } from '../services/mail.service.js';
import { sendSms } from '../services/sms.service.js';
import { broadcastLimiter, reportLimiter } from '../middleware/rate-limits.js';
import { env } from '../config/env.js';
import { buildAdminPdf, buildAdminWorkbook, collectAdminReportData } from '../services/admin-report.service.js';

export const adminRouter=Router(); adminRouter.use(requireAuth,requireAdmin);
const planSchema=z.object({name:z.string().trim().min(2).max(40),description:z.string().trim().max(240).nullable().optional(),priceInr:z.coerce.number().int().min(0).max(1_000_000),durationDays:z.coerce.number().int().min(1).max(3650),aiCredits:z.coerce.number().int().min(0).max(1_000_000),reportExportsEnabled:z.boolean().optional(),active:z.boolean().optional(),hidden:z.boolean().optional(),razorpayPlanId:z.string().trim().min(1).nullable().optional()});
const couponSchema=z.object({code:z.string().trim().min(3).max(64).optional(),discountPercent:z.coerce.number().int().min(0).max(100),planId:z.string().nullable().optional(),grantDays:z.coerce.number().int().min(1).max(3650).nullable().optional(),maxRedemptions:z.coerce.number().int().min(1).nullable().optional(),razorpayOfferId:z.string().trim().min(1).nullable().optional(),active:z.boolean().optional(),validFrom:z.coerce.date().optional(),validUntil:z.coerce.date().nullable().optional()});

adminRouter.get('/overview',async(_req,res)=>{const [users,resources,plans,coupons,subscriptions]=await Promise.all([prisma.user.count(),prisma.resource.count(),prisma.subscriptionPlan.count(),prisma.coupon.count(),prisma.userSubscription.count({where:{status:'ACTIVE',endsAt:{gt:new Date()}}})]);res.json({users,resources,plans,coupons,activeSubscriptions:subscriptions});});
adminRouter.get('/reports/:format',reportLimiter,async(req,res)=>{const format=z.enum(['xlsx','pdf']).parse(req.params.format);const report=await collectAdminReportData();const stamp=report.generatedAt.toISOString().slice(0,10);res.set({
  'Cache-Control':'private, no-store',
  'X-Content-Type-Options':'nosniff',
  'Content-Disposition':`attachment; filename="snoq-admin-report-${stamp}.${format}"`,
});
  if(format==='xlsx'){res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(await buildAdminWorkbook(report));return;}
  res.type('application/pdf').send(await buildAdminPdf(report));
});
adminRouter.get('/plans',async(_req,res)=>res.json({plans:await prisma.subscriptionPlan.findMany({orderBy:{priceInr:'asc'}})}));
adminRouter.post('/plans',async(req,res)=>{const data=planSchema.parse(req.body);res.status(201).json({plan:await prisma.subscriptionPlan.create({data:{...data,reportExportsEnabled:data.priceInr>0&&data.reportExportsEnabled===true}})});});
adminRouter.patch('/plans/:id',async(req,res)=>{const existing=await prisma.subscriptionPlan.findUniqueOrThrow({where:{id:req.params.id},select:{priceInr:true}});const data=planSchema.partial().parse(req.body);const priceInr=data.priceInr??existing.priceInr;res.json({plan:await prisma.subscriptionPlan.update({where:{id:req.params.id},data:{...data,...(priceInr===0?{reportExportsEnabled:false}:{})}})});});
adminRouter.delete('/plans/:id',async(req,res)=>{const count=await prisma.userSubscription.count({where:{planId:req.params.id}});if(count)return res.status(409).json({message:'This plan has subscriptions. Hide it instead of deleting it.'});await prisma.subscriptionPlan.delete({where:{id:req.params.id}});res.status(204).send();});
adminRouter.get('/coupons',async(_req,res)=>res.json({coupons:await prisma.coupon.findMany({include:{plan:{select:{name:true}},_count:{select:{redemptions:true}}},orderBy:{createdAt:'desc'}})}));
adminRouter.post('/coupons',async(req,res)=>{const data=couponSchema.parse(req.body);const code=(data.code||generateCouponCode()).toUpperCase();res.status(201).json({coupon:await prisma.coupon.create({data:{...data,code}})});});
adminRouter.patch('/coupons/:id',async(req,res)=>res.json({coupon:await prisma.coupon.update({where:{id:req.params.id},data:couponSchema.partial().parse(req.body)})}));
adminRouter.delete('/coupons/:id',async(req,res)=>{await prisma.coupon.delete({where:{id:req.params.id}});res.status(204).send();});
adminRouter.post('/coupons/:id/notify',broadcastLimiter,async(req,res)=>{const data=z.object({channel:z.enum(['EMAIL','SMS']),recipientMode:z.enum(['ALL','SELECTED']),userIds:z.array(z.string().cuid()).max(500).default([])}).parse(req.body);const coupon=await prisma.coupon.findUnique({where:{id:z.string().cuid().parse(req.params.id)},include:{plan:{select:{name:true}}}});if(!coupon)return res.status(404).json({message:'Coupon not found'});const users=await prisma.user.findMany({where:{...(data.recipientMode==='SELECTED'?{id:{in:data.userIds}}:{}),isSuspended:false},take:500,select:{id:true,email:true,phoneNumber:true}});if(data.recipientMode==='SELECTED'&&!users.length)return res.status(400).json({message:'Select at least one active user'});let sent=0,skipped=0;for(const user of users){try{if(data.channel==='EMAIL')await sendCouponAnnouncementEmail(user.email,{code:coupon.code,discountPercent:coupon.discountPercent,validUntil:coupon.validUntil,planName:coupon.plan?.name});else if(user.phoneNumber)await sendSms(user.phoneNumber,`SNOQ offer: use ${coupon.code} for ${coupon.discountPercent}% off. ${env.FRONTEND_URL}/pricing`);else {skipped++;continue;}sent++;}catch{skipped++;}}res.json({sent,skipped,total:users.length,capped:data.recipientMode==='ALL'&&users.length===500});});
adminRouter.get('/users',async(req,res)=>{const take=Math.min(Number(req.query.limit??50),100);const users=await prisma.user.findMany({take,orderBy:{createdAt:'desc'},select:{id:true,email:true,name:true,phoneNumber:true,role:true,isSuspended:true,createdAt:true,_count:{select:{resources:true,subscriptions:true}}}});res.json({users});});
adminRouter.patch('/users/:id',async(req,res)=>{if(req.params.id===req.auth!.userId)return res.status(400).json({message:'You cannot modify your own administrator account here'});const data=z.object({isSuspended:z.boolean().optional(),role:z.enum(['USER','ADMIN']).optional(),phoneNumber:z.string().trim().min(7).max(20).nullable().optional()}).parse(req.body);res.json({user:await prisma.user.update({where:{id:req.params.id},data,select:{id:true,email:true,name:true,phoneNumber:true,role:true,isSuspended:true}})});});
adminRouter.delete('/users/:id',async(req,res)=>{if(req.params.id===req.auth!.userId)return res.status(400).json({message:'You cannot delete your own administrator account'});await prisma.user.delete({where:{id:req.params.id}});res.status(204).send();});
