import bcrypt from 'bcryptjs'; import jwt from 'jsonwebtoken'; import { env } from '../config/env.js';
export type JwtPayload = { userId: string; email: string; iat?: number };
export const hashPassword = (password: string) => bcrypt.hash(password, 12);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);
export const signSession = (payload: JwtPayload) => jwt.sign(payload, env.JWT_SECRET, { expiresIn: '7d' });
export const verifySession = (token: string) => jwt.verify(token, env.JWT_SECRET) as JwtPayload;
