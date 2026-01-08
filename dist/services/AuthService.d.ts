import { Request, Response, NextFunction } from 'express';
import { UserService } from './UserService.js';
export interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        email: string;
        username: string;
    };
}
export declare class AuthService {
    private userService;
    constructor(userService: UserService);
    private getTokenFromRequest;
    middleware(): (req: AuthenticatedRequest, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
    optionalMiddleware(): (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
}
//# sourceMappingURL=AuthService.d.ts.map