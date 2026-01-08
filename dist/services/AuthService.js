export class AuthService {
    userService;
    constructor(userService) {
        this.userService = userService;
    }
    getTokenFromRequest(req) {
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
    middleware() {
        return (req, res, next) => {
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
                username: user.username
            };
            next();
        };
    }
    optionalMiddleware() {
        return (req, _res, next) => {
            const token = this.getTokenFromRequest(req);
            if (token) {
                const user = this.userService.validateSession(token);
                if (user) {
                    req.user = {
                        id: user.id,
                        email: user.email,
                        username: user.username
                    };
                }
            }
            next();
        };
    }
}
//# sourceMappingURL=AuthService.js.map