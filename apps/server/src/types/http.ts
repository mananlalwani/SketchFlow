import type express from 'express';

export interface AuthenticatedRequest extends express.Request<Record<string, string>> {
  auth?: {
    userId: string | null;
    sessionId: string | null;
  };
}
