import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('@clerk/express', () => ({ getAuth: vi.fn() }));

import { getAuth } from '@clerk/express';
import { requireAuthenticatedUser } from '../../middleware/auth.js';
import type { AuthenticatedRequest } from '../../types/http.js';

describe('requireAuthenticatedUser', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fails closed when Clerk has no verified user', async () => {
    vi.mocked(getAuth).mockReturnValue({ userId: null });
    const app = express();
    app.get('/', requireAuthenticatedUser, (_req, res) => res.sendStatus(204));

    await expect(request(app).get('/')).resolves.toMatchObject({
      status: 401,
      body: { error: 'Authentication required' },
    });
  });

  it('attaches the verified user for downstream handlers', async () => {
    vi.mocked(getAuth).mockReturnValue({ userId: 'user_123' });
    const app = express();
    app.get('/', requireAuthenticatedUser, (req: AuthenticatedRequest, res) => {
      res.json({ userId: req.auth?.userId });
    });

    await expect(request(app).get('/')).resolves.toMatchObject({
      status: 200,
      body: { userId: 'user_123' },
    });
  });
});
