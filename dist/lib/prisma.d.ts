import Prisma from '@prisma/client';
export declare const prisma: Prisma.PrismaClient<Prisma.Prisma.PrismaClientOptions, unknown, import("@prisma/client/runtime/client.js").InternalArgs>;
/**
 * Gracefully disconnect Prisma and close the connection pool
 * Called during server shutdown
 */
export declare function disconnectPrisma(): Promise<void>;
/**
 * Check if database is reachable (for readiness probes)
 */
export declare function checkDatabaseHealth(): Promise<boolean>;
//# sourceMappingURL=prisma.d.ts.map