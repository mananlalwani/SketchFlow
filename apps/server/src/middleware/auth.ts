import { getAuth } from '@clerk/express';
import type express from 'express';
import type { AuthenticatedRequest } from '../types/http.js';

/** Attaches the verified Clerk user or terminates the request with 401. */
export function requireAuthenticatedUser(
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction,
): void {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  req.auth = { userId, sessionId: null };
  next();
}
