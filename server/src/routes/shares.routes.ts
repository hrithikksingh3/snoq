import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { sendListAccessRequestEmail } from '../services/mail.service.js';
import { publicAccessRequestLimiter } from '../middleware/rate-limits.js';

export const sharesRouter=Router();
const requestSchema=z.object({email:z.string().trim().email().transform(value=>value.toLowerCase()),name:z.string().trim().min(1).max(100).optional()});
const resourceSelect={id:true,kind:true,title:true,description:true,resourceType:true,summary:true,author:true,sourcePlatform:true,url:true,thumbnailUrl:true,faviconUrl:true,createdAt:true,categories:{select:{category:{select:{name:true}}}},tags:{select:{tag:{select:{name:true}}}},document:{select:{originalFilename:true,mimeType:true,size:true}}} as const;
const tokenHash=(token:string)=>crypto.createHash('sha256').update(token).digest('hex');

sharesRouter.get('/:slug',async(req,res)=>{
  const share=await prisma.listShare.findUnique({where:{slug:z.string().min(20).max(100).parse(req.params.slug)},include:{list:{include:{user:{select:{name:true}},resources:{orderBy:{createdAt:'desc'},include:{resource:{select:resourceSelect}}}}}}});
  if(!share || !share.enabled) return res.status(404).json({message:'This shared list is unavailable'});
  const header={name:share.list.name,description:share.list.description,color:share.list.color,ownerName:share.list.user.name};
  if(share.mode==='RESTRICTED') {
    const access=typeof req.query.access==='string'?req.query.access:'';
    const granted=access?await prisma.listAccessRequest.findFirst({where:{shareId:share.id,status:'APPROVED',accessTokenHash:tokenHash(access)}}):null;
    if(!granted) return res.status(403).json({restricted:true,list:header,message:'Access approval is required for this list'});
  }
  res.json({mode:share.mode,list:{...header,resources:share.list.resources.map(item=>item.resource)}});
});

sharesRouter.post('/:slug/access-requests',publicAccessRequestLimiter,async(req,res)=>{
  const input=requestSchema.parse(req.body);
  const share=await prisma.listShare.findUnique({where:{slug:z.string().min(20).max(100).parse(req.params.slug)},include:{list:{include:{user:{select:{email:true,name:true}}}}}});
  if(!share || !share.enabled) return res.status(404).json({message:'This shared list is unavailable'});
  if(share.mode!=='RESTRICTED') return res.status(400).json({message:'This list does not require an access request'});
  const existing=await prisma.listAccessRequest.findUnique({where:{shareId_email:{shareId:share.id,email:input.email}}});
  if(existing?.status==='PENDING') return res.status(202).json({message:'Your access request is already waiting for approval'});
  const request=await prisma.listAccessRequest.upsert({where:{shareId_email:{shareId:share.id,email:input.email}},create:{shareId:share.id,email:input.email,name:input.name},update:{name:input.name,status:'PENDING',approvedAt:null,accessTokenHash:null}});
  await sendListAccessRequestEmail(share.list.user.email,input,share.list.name,share.list.id,request.id);
  res.status(202).json({message:'Your access request was sent'});
});
