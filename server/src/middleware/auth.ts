import type { NextFunction, Request, Response } from 'express'; import { verifySession } from '../services/auth.service.js'; import { prisma } from '../lib/prisma.js';
export async function requireAuth(req: Request, res: Response, next: NextFunction) { try { const token = req.cookies?.rv_session; if (!token) return res.status(401).json({ message: 'Authentication required' }); const auth=verifySession(token); const user=await prisma.user.findUnique({where:{id:auth.userId},select:{isSuspended:true,passwordChangedAt:true}}); if(!user)return res.status(401).json({message:'Session invalid'}); if(user.isSuspended)return res.status(403).json({message:'This account has been suspended. Contact support if you need help.'}); if(user.passwordChangedAt&&(!auth.iat||auth.iat*1000<user.passwordChangedAt.getTime()))return res.status(401).json({message:'Your password changed. Please sign in again.'}); req.auth = auth; next(); } catch { return res.status(401).json({ message: 'Session expired. Please sign in again.' }); } }
export async function requireAdmin(req:Request,res:Response,next:NextFunction){
  if(!req.auth)return res.status(401).json({message:'Authentication required'});
  const user=await prisma.user.findUnique({where:{id:req.auth.userId},select:{role:true,isSuspended:true}});
  if(!user||user.isSuspended)return res.status(403).json({message:'Administrator access is required'});
  if(user.role!=='ADMIN')return res.status(403).json({message:'Administrator access is required'});
  next();
}
