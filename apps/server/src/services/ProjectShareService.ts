import { randomBytes } from 'crypto';
import { logger } from '../utils/logger.js';
import { prisma } from '../lib/prisma.js';
import { isActivePublicShare } from '../lib/projectShare.js';
import type { ProjectRecord, PublicProjectRecord } from './ProjectService.js';

export class ProjectShareService {
  public constructor(
    private readonly database: typeof prisma = prisma,
    private readonly log: Pick<typeof logger, 'debug' | 'info' | 'warn' | 'error'> = logger,
  ) {}

  public async getByShareToken(shareToken: string): Promise<PublicProjectRecord | null> {
    try {
      const project = await this.database.project.findUnique({
        where: { shareToken },
      });

      if (!project || !isActivePublicShare(project)) return null;

      return {
        id: project.id,
        title: project.title,
        data: project.data,
        revision: project.revision,
        updatedAt: project.updatedAt.getTime(),
        createdAt: project.createdAt.getTime(),
        shared: true,
        shareExpiresAt: project.shareExpiresAt?.getTime(),
        role: 'viewer',
      };
    } catch (e) {
      this.log.error('Failed to get project by share token', e);
      return null;
    }
  }

  public async shareProject(id: string, userId: string): Promise<ProjectRecord | null> {
    try {
      const existing = await this.database.project.findUnique({
        where: { id },
      });

      if (!existing || existing.userId !== userId) {
        return null;
      }

      const shareToken = randomBytes(32).toString('base64url');
      const shareExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const project = await this.database.project.update({
        where: { id },
        data: {
          shared: true,
          shareToken,
          shareExpiresAt,
          shareRevokedAt: null,
        },
        include: {
          collaborators: {
            select: { userId: true, role: true },
          },
        },
      });

      return {
        id: project.id,
        userId: project.userId,
        title: project.title,
        data: project.data,
        updatedAt: project.updatedAt.getTime(),
        createdAt: project.createdAt.getTime(),
        shared: project.shared,
        shareToken: project.shareToken ?? undefined,
        shareExpiresAt: project.shareExpiresAt?.getTime(),
        collaborators: project.collaborators,
      };
    } catch (e) {
      this.log.error('Failed to share project', e);
      return null;
    }
  }

  public async unshareProject(id: string, userId: string): Promise<ProjectRecord | null> {
    try {
      const existing = await this.database.project.findUnique({
        where: { id },
      });

      if (!existing || existing.userId !== userId) {
        return null;
      }

      const project = await this.database.project.update({
        where: { id },
        data: {
          shared: false,
          shareToken: null,
          shareRevokedAt: new Date(),
        },
        include: {
          collaborators: {
            select: { userId: true, role: true },
          },
        },
      });

      return {
        id: project.id,
        userId: project.userId,
        title: project.title,
        data: project.data,
        updatedAt: project.updatedAt.getTime(),
        createdAt: project.createdAt.getTime(),
        shared: project.shared,
        shareToken: project.shareToken ?? undefined,
        shareExpiresAt: project.shareExpiresAt?.getTime(),
        collaborators: project.collaborators,
      };
    } catch (e) {
      this.log.error('Failed to unshare project', e);
      return null;
    }
  }
}
