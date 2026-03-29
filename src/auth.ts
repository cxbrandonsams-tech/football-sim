import jwt from 'jsonwebtoken';
import { type Request, type Response, type NextFunction } from 'express';
import { getUserById } from './db';

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'gridiron-dev-secret-change-in-prod';

export interface AuthPayload {
  userId: string;
  username: string;
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    // Verify user still exists in DB (handles wiped databases with stale tokens)
    if (!getUserById(payload.userId)) {
      res.status(401).json({ error: 'Account no longer exists. Please sign up again.' });
      return;
    }
    (req as AuthRequest).user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}
