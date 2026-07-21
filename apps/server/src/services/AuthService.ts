import { Request, Response, NextFunction } from 'express';
import { UserService } from './UserService.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    username: string;
  };
}

export class AuthService {
  constructor(private userService: UserService) {}

  private getTokenFromRequest(req: Request): string | null {
    // Check Authorization header: Bearer <token>
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check cookie
    if (req.cookies && req.cookies.authToken) {
      return req.cookies.authToken;
    }

    // Check query parameter (for development/testing)
    if (req.query.token && typeof req.query.token === 'string') {
      return req.query.token;
    }

    return null;
  }

  public middleware() {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const token = this.getTokenFromRequest(req);

      if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const user = this.userService.validateSession(token);
      if (!user) {
        return res.status(401).json({ error: 'Invalid or expired session' });
      }

      req.user = {
        id: user.id,
        email: user.email,
        username: user.username,
      };

      next();
    };
  }

  public optionalMiddleware() {
    return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
      const token = this.getTokenFromRequest(req);

      if (token) {
        const user = this.userService.validateSession(token);
        if (user) {
          req.user = {
            id: user.id,
            email: user.email,
            username: user.username,
          };
        }
      }

      next();
    };
  }
}
