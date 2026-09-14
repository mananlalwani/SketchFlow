import { logger } from '../utils/logger.js';
import { prisma } from '../lib/prisma.js';

export class ProjectCollaboratorService {
  public constructor(
    private readonly database: typeof prisma = prisma,
    private readonly log: Pick<typeof logger, 'debug' | 'info' | 'warn' | 'error'> = logger,
  ) {}

  public async addCollaborator(
    projectId: string,
    ownerUserId: string,
    collaboratorUserId: string,
    role: 'editor' | 'viewer' = 'editor',
  ): Promise<boolean> {
    try {
      const project = await this.database.project.findUnique({
        where: { id: projectId },
      });

      if (!project || project.userId !== ownerUserId) {
        this.log.warn(`Failed to add collaborator: project not found or not owner`, {
          projectId,
          ownerUserId,
          projectUserId: project?.userId,
        });
        return false;
      }

      // Can't add owner as collaborator
      if (collaboratorUserId === ownerUserId) {
        this.log.warn(`Attempted to add owner as collaborator`, {
          projectId,
          userId: ownerUserId,
        });
        return false;
      }

      // Extra safety: Check if collaborator is somehow the project owner
      if (collaboratorUserId === project.userId) {
        this.log.warn(`Collaborator userId matches project owner`, {
          projectId,
          collaboratorUserId,
          projectUserId: project.userId,
        });
        return false;
      }

      await this.database.projectCollaborator.upsert({
        where: {
          projectId_userId: {
            projectId,
            userId: collaboratorUserId,
          },
        },
        create: {
          projectId,
          userId: collaboratorUserId,
          role,
        },
        update: {
          role,
        },
      });

      this.log.info(
        `Added collaborator ${collaboratorUserId} with role ${role} to project ${projectId}`,
      );

      return true;
    } catch (e) {
      this.log.error('Failed to add collaborator', e);
      return false;
    }
  }

  /**
   * Clean up any corrupt data where owners are listed as collaborators
   */
  public async cleanupCorruptCollaborators(): Promise<void> {
    try {
      const projects = await this.database.project.findMany({
        include: {
          collaborators: true,
        },
      });

      for (const project of projects) {
        const ownerAsCollaborator = project.collaborators.find((c) => c.userId === project.userId);
        if (ownerAsCollaborator) {
          this.log.warn(`Found owner as collaborator in project ${project.id}, cleaning up...`);
          await this.database.projectCollaborator.delete({
            where: {
              id: ownerAsCollaborator.id,
            },
          });
        }
      }
    } catch (e) {
      this.log.error('Failed to cleanup corrupt collaborators', e);
    }
  }

  public async removeCollaborator(
    projectId: string,
    ownerUserId: string,
    collaboratorUserId: string,
  ): Promise<boolean> {
    try {
      const project = await this.database.project.findUnique({
        where: { id: projectId },
      });

      if (!project || project.userId !== ownerUserId) {
        return false;
      }

      await this.database.projectCollaborator.deleteMany({
        where: {
          projectId,
          userId: collaboratorUserId,
        },
      });

      return true;
    } catch (e) {
      this.log.error('Failed to remove collaborator', e);
      return false;
    }
  }

  public async getCollaborators(
    projectId: string,
    userId: string,
  ): Promise<{ userId: string; role: string; addedAt: number }[]> {
    try {
      const project = await this.database.project.findUnique({
        where: { id: projectId },
        include: { collaborators: true },
      });

      if (!project) return [];

      // Only owner can view full collaborator list
      if (project.userId !== userId) {
        return [];
      }

      return project.collaborators.map((c) => ({
        userId: c.userId,
        role: c.role,
        addedAt: c.addedAt.getTime(),
      }));
    } catch (e) {
      this.log.error('Failed to get collaborators', e);
      return [];
    }
  }
}
