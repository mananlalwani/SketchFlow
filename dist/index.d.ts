import 'dotenv/config';
import './otel.js';
import express from 'express';
export interface AuthenticatedRequest extends express.Request {
    auth?: {
        userId: string | null;
        sessionId: string | null;
    };
}
//# sourceMappingURL=index.d.ts.map