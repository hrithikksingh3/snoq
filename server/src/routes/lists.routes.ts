import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { createListSchema, updateListSchema } from '../schemas/list.schemas.js';
import { sendListAccessGrantedEmail } from '../services/mail.service.js';
import { env } from '../config/env.js';

export const listsRouter = Router();
listsRouter.use(requireAuth);
const shareMode=z.enum(['PUBLIC','RESTRICTED']);
const tokenHash=(token:string)=>crypto.createHash('sha256').update(token).digest('hex');
const createSlug=()=>crypto.randomBytes(18).toString('base64url');
async function ownedList(id:string,userId:string) { return prisma.resourceList.findFirst({where:{id,userId}}); }

listsRouter.get('/', async (req, res) => {
  const lists = await prisma.resourceList.findMany({ where: { userId: req.auth!.userId }, include: { _count: { select: { resources: true } }, shares:{select:{id:true,mode:true,slug:true,enabled:true,createdAt:true}} }, orderBy: { createdAt: 'desc' } });
  res.json({ lists });
});
listsRouter.post('/', async (req, res) => {
  const data = createListSchema.parse(req.body);
  const list = await prisma.resourceList.create({ data: { ...data, userId: req.auth!.userId } });
  res.status(201).json({ list });
});
listsRouter.post('/:id/shares',async(req,res)=>{
  if(!await ownedList(req.params.id,req.auth!.userId)) return res.status(404).json({message:'List not found'});
  const mode=shareMode.parse(req.body.mode);
  const share=await prisma.listShare.upsert({where:{listId_mode:{listId:req.params.id,mode}},create:{listId:req.params.id,mode,slug:createSlug()},update:{enabled:true}});
  res.status(201).json({share});
});
listsRouter.patch('/:id/shares/:shareId',async(req,res)=>{
  if(!await ownedList(req.params.id,req.auth!.userId)) return res.status(404).json({message:'List not found'});
  const enabled=z.object({enabled:z.boolean()}).parse(req.body).enabled;
  const result=await prisma.listShare.updateMany({where:{id:req.params.shareId,listId:req.params.id},data:{enabled}});
  if(!result.count) return res.status(404).json({message:'Share link not found'});
  res.status(204).send();
});
listsRouter.get('/:id/access-requests',async(req,res)=>{
  if(!await ownedList(req.params.id,req.auth!.userId)) return res.status(404).json({message:'List not found'});
  const requests=await prisma.listAccessRequest.findMany({where:{share:{listId:req.params.id}},include:{share:{select:{id:true,mode:true,slug:true}}},orderBy:{createdAt:'desc'}});
  res.json({requests});
});
listsRouter.post('/:id/access-requests/:requestId/approve',async(req,res)=>{
  const request=await prisma.listAccessRequest.findFirst({where:{id:req.params.requestId,share:{listId:req.params.id,list:{userId:req.auth!.userId}}},include:{share:{include:{list:true}}}});
  if(!request) return res.status(404).json({message:'Access request not found'});
  const accessToken=crypto.randomBytes(32).toString('base64url');
  await prisma.listAccessRequest.update({where:{id:request.id},data:{status:'APPROVED',approvedAt:new Date(),accessTokenHash:tokenHash(accessToken)}});
  await sendListAccessGrantedEmail(request.email,request.share.list.name,`${env.FRONTEND_URL}/share/${request.share.slug}?access=${encodeURIComponent(accessToken)}`);
  res.json({message:'Access approved and email sent'});
});
listsRouter.post('/:id/access-requests/:requestId/decline',async(req,res)=>{
  const result=await prisma.listAccessRequest.updateMany({where:{id:req.params.requestId,share:{listId:req.params.id,list:{userId:req.auth!.userId}}},data:{status:'DECLINED',approvedAt:null,accessTokenHash:null}});
  if(!result.count) return res.status(404).json({message:'Access request not found'});
  res.status(204).send();
});
listsRouter.patch('/:id', async (req, res) => {
  const exists = await ownedList(req.params.id,req.auth!.userId);
  if (!exists) return res.status(404).json({ message: 'List not found' });
  const list = await prisma.resourceList.update({ where: { id: exists.id }, data: updateListSchema.parse(req.body) });
  res.json({ list });
});
listsRouter.delete('/:id', async (req, res) => {
  const result = await prisma.resourceList.deleteMany({ where: { id: req.params.id, userId: req.auth!.userId } });
  if (!result.count) return res.status(404).json({ message: 'List not found' });
  res.status(204).send();
});
