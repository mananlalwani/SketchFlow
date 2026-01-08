import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export class UserService {
    usersDir;
    sessionsDir;
    sessions = new Map();
    constructor(usersDirRelative = '../../data/users', sessionsDirRelative = '../../data/sessions') {
        this.usersDir = path.join(__dirname, usersDirRelative);
        this.sessionsDir = path.join(__dirname, sessionsDirRelative);
        this.ensureDirs();
        this.loadSessions();
    }
    ensureDirs() {
        if (!fs.existsSync(this.usersDir)) {
            fs.mkdirSync(this.usersDir, { recursive: true });
            logger.info(`Created users directory at ${this.usersDir}`);
        }
        if (!fs.existsSync(this.sessionsDir)) {
            fs.mkdirSync(this.sessionsDir, { recursive: true });
            logger.info(`Created sessions directory at ${this.sessionsDir}`);
        }
    }
    userPath(id) {
        return path.join(this.usersDir, `${id}.json`);
    }
    sessionPath(token) {
        return path.join(this.sessionsDir, `${token}.json`);
    }
    hashPassword(password) {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
        return `${salt}:${hash}`;
    }
    verifyPassword(password, hash) {
        const [salt, storedHash] = hash.split(':');
        const computedHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
        return computedHash === storedHash;
    }
    generateToken() {
        return crypto.randomBytes(32).toString('hex');
    }
    async createUser(email, username, password) {
        // Check if email or username already exists
        const existing = this.findByEmail(email);
        if (existing) {
            throw new Error('Email already registered');
        }
        const existingUsername = this.findByUsername(username);
        if (existingUsername) {
            throw new Error('Username already taken');
        }
        const id = crypto.randomBytes(16).toString('hex');
        const now = Date.now();
        const user = {
            id,
            email: email.toLowerCase(),
            username,
            passwordHash: this.hashPassword(password),
            createdAt: now,
            updatedAt: now
        };
        fs.writeFileSync(this.userPath(id), JSON.stringify(user, null, 2), 'utf-8');
        logger.info(`Created user: ${username} (${id})`);
        return user;
    }
    getUser(id) {
        const p = this.userPath(id);
        if (!fs.existsSync(p))
            return null;
        try {
            const raw = fs.readFileSync(p, 'utf-8');
            return JSON.parse(raw);
        }
        catch (e) {
            logger.error('Failed to read user', e);
            return null;
        }
    }
    findByEmail(email) {
        const files = fs.readdirSync(this.usersDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
            try {
                const raw = fs.readFileSync(path.join(this.usersDir, file), 'utf-8');
                const user = JSON.parse(raw);
                if (user.email === email.toLowerCase()) {
                    return user;
                }
            }
            catch {
                continue;
            }
        }
        return null;
    }
    findByUsername(username) {
        const files = fs.readdirSync(this.usersDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
            try {
                const raw = fs.readFileSync(path.join(this.usersDir, file), 'utf-8');
                const user = JSON.parse(raw);
                if (user.username === username) {
                    return user;
                }
            }
            catch {
                continue;
            }
        }
        return null;
    }
    async authenticate(email, password) {
        const user = this.findByEmail(email);
        if (!user)
            return null;
        if (!this.verifyPassword(password, user.passwordHash)) {
            return null;
        }
        return user;
    }
    createSession(userId) {
        const token = this.generateToken();
        const now = Date.now();
        const expiresAt = now + (7 * 24 * 60 * 60 * 1000); // 7 days
        const session = {
            userId,
            token,
            expiresAt,
            createdAt: now
        };
        this.sessions.set(token, session);
        fs.writeFileSync(this.sessionPath(token), JSON.stringify(session, null, 2), 'utf-8');
        return session;
    }
    getSession(token) {
        // Check memory cache first
        const cached = this.sessions.get(token);
        if (cached && cached.expiresAt > Date.now()) {
            return cached;
        }
        // Check disk
        const p = this.sessionPath(token);
        if (!fs.existsSync(p))
            return null;
        try {
            const raw = fs.readFileSync(p, 'utf-8');
            const session = JSON.parse(raw);
            if (session.expiresAt <= Date.now()) {
                this.deleteSession(token);
                return null;
            }
            this.sessions.set(token, session);
            return session;
        }
        catch (e) {
            logger.error('Failed to read session', e);
            return null;
        }
    }
    deleteSession(token) {
        this.sessions.delete(token);
        const p = this.sessionPath(token);
        if (fs.existsSync(p)) {
            fs.unlinkSync(p);
        }
    }
    validateSession(token) {
        const session = this.getSession(token);
        if (!session)
            return null;
        if (session.expiresAt <= Date.now()) {
            this.deleteSession(token);
            return null;
        }
        return this.getUser(session.userId);
    }
    loadSessions() {
        const files = fs.readdirSync(this.sessionsDir).filter(f => f.endsWith('.json'));
        const now = Date.now();
        for (const file of files) {
            try {
                const raw = fs.readFileSync(path.join(this.sessionsDir, file), 'utf-8');
                const session = JSON.parse(raw);
                if (session.expiresAt > now) {
                    this.sessions.set(session.token, session);
                }
                else {
                    // Clean up expired session
                    fs.unlinkSync(path.join(this.sessionsDir, file));
                }
            }
            catch {
                continue;
            }
        }
    }
    cleanupExpiredSessions() {
        const now = Date.now();
        for (const [token, session] of this.sessions.entries()) {
            if (session.expiresAt <= now) {
                this.deleteSession(token);
            }
        }
    }
}
//# sourceMappingURL=UserService.js.map