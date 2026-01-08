export interface User {
    id: string;
    email: string;
    username: string;
    passwordHash: string;
    createdAt: number;
    updatedAt: number;
}
export interface UserSession {
    userId: string;
    token: string;
    expiresAt: number;
    createdAt: number;
}
export declare class UserService {
    private usersDir;
    private sessionsDir;
    private sessions;
    constructor(usersDirRelative?: string, sessionsDirRelative?: string);
    private ensureDirs;
    private userPath;
    private sessionPath;
    private hashPassword;
    private verifyPassword;
    private generateToken;
    createUser(email: string, username: string, password: string): Promise<User>;
    getUser(id: string): User | null;
    findByEmail(email: string): User | null;
    findByUsername(username: string): User | null;
    authenticate(email: string, password: string): Promise<User | null>;
    createSession(userId: string): UserSession;
    getSession(token: string): UserSession | null;
    deleteSession(token: string): void;
    validateSession(token: string): User | null;
    private loadSessions;
    cleanupExpiredSessions(): void;
}
//# sourceMappingURL=UserService.d.ts.map