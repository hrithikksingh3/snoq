import type { JwtPayload } from '../services/auth.service.js';
declare global { namespace Express { interface Request { auth?: JwtPayload } } }
export {};
