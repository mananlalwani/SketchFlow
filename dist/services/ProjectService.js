import { logger } from '../utils/logger.js';
import { prisma } from '../lib/prisma.js';
export class ProjectService {
    // Permission checking helper
    async checkPermission(projectId, userId, action) {
        try {
            const project = await prisma.project.findUnique({
                where: { id: projectId },
                include: {
                    collaborators: {
                        select: { userId: true, role: true }
                    }
                }
            });
            if (!project)
                return false;
            const isOwner = project.userId === userId;
            const collaborator = project.collaborators.find(c => c.userId === userId);
            switch (action) {
                case 'view':
                    return isOwner || !!collaborator || project.shared;
                case 'edit':
                    return isOwner || (collaborator?.role === 'editor');
                case 'delete':
                case 'share':
                case 'manage':
                    return isOwner;
                default:
                    return false;
            }
        }
        catch (e) {
            logger.error('Permission check failed', e);
            return false;
        }
    }
    async list(userId) {
        try {
            // Try with collaborators first
            let ownedProjects;
            let collaboratedProjects = [];
            try {
                // Get projects owned by user
                ownedProjects = await prisma.project.findMany({
                    where: { userId },
                    select: {
                        id: true,
                        userId: true,
                        title: true,
                        updatedAt: true,
                        createdAt: true,
                        shared: true,
                        shareToken: true,
                        folderId: true,
                        collaborators: {
                            select: { userId: true, role: true }
                        }
                    },
                    orderBy: { updatedAt: 'desc' },
                });
                // Get projects where user is a collaborator
                collaboratedProjects = await prisma.project.findMany({
                    where: {
                        collaborators: {
                            some: { userId }
                        }
                    },
                    select: {
                        id: true,
                        userId: true,
                        title: true,
                        updatedAt: true,
                        createdAt: true,
                        shared: true,
                        shareToken: true,
                        folderId: true,
                        collaborators: {
                            select: { userId: true, role: true }
                        }
                    },
                    orderBy: { updatedAt: 'desc' },
                });
            }
            catch (e) {
                // Collaborators table might not exist yet - fallback to simple query
                logger.warn('Collaborators query failed, falling back to simple query', { error: e });
                const projects = await prisma.project.findMany({
                    where: { userId },
                    select: {
                        id: true,
                        userId: true,
                        title: true,
                        updatedAt: true,
                        createdAt: true,
                        shared: true,
                        shareToken: true,
                    },
                    orderBy: { updatedAt: 'desc' },
                });
                return projects.map(p => ({
                    id: p.id,
                    userId: p.userId,
                    title: p.title,
                    updatedAt: p.updatedAt.getTime(),
                    createdAt: p.createdAt.getTime(),
                    shared: p.shared,
                    shareToken: p.shareToken ?? undefined,
                    role: 'owner',
                    collaborators: []
                }));
            }
            // Combine and dedupe (in case user is both owner and collaborator somehow)
            const allProjects = [...ownedProjects, ...(collaboratedProjects || [])];
            const seen = new Set();
            const deduped = allProjects.filter(p => {
                if (seen.has(p.id))
                    return false;
                seen.add(p.id);
                return true;
            });
            return deduped.map(p => {
                const isOwner = p.userId === userId;
                const collab = p.collaborators?.find((c) => c.userId === userId);
                const role = isOwner ? 'owner' : collab?.role || 'viewer';
                // Debug log if there's a mismatch
                if (isOwner && collab) {
                    logger.warn(`User ${userId} is both owner and collaborator of project ${p.id}. This shouldn't happen!`, {
                        projectId: p.id,
                        projectUserId: p.userId,
                        collaboratorRole: collab.role
                    });
                }
                return {
                    id: p.id,
                    userId: p.userId,
                    title: p.title,
                    updatedAt: p.updatedAt.getTime(),
                    createdAt: p.createdAt.getTime(),
                    shared: p.shared,
                    shareToken: p.shareToken ?? undefined,
                    folderId: p.folderId ?? null,
                    role,
                    collaborators: p.collaborators
                };
            }).sort((a, b) => b.updatedAt - a.updatedAt);
        }
        catch (e) {
            logger.error('Failed to list projects', e);
            return [];
        }
    }
    async get(id, userId) {
        try {
            let project;
            let collaborators = [];
            try {
                project = await prisma.project.findUnique({
                    where: { id },
                    include: {
                        collaborators: {
                            select: { userId: true, role: true }
                        }
                    }
                });
                collaborators = project?.collaborators || [];
            }
            catch {
                // Fallback if collaborators table doesn't exist
                project = await prisma.project.findUnique({
                    where: { id },
                });
            }
            if (!project)
                return null;
            // Check access: owner, collaborator, or shared
            const isOwner = project.userId === userId;
            const collaborator = collaborators.find(c => c.userId === userId);
            const hasAccess = isOwner || collaborator || project.shared;
            if (userId && !hasAccess) {
                return null;
            }
            const role = isOwner ? 'owner' : collaborator?.role || 'viewer';
            return {
                id: project.id,
                userId: project.userId,
                title: project.title,
                data: project.data,
                updatedAt: project.updatedAt.getTime(),
                createdAt: project.createdAt.getTime(),
                shared: project.shared,
                shareToken: project.shareToken ?? undefined,
                role,
                collaborators
            };
        }
        catch (e) {
            logger.error('Failed to get project', e);
            return null;
        }
    }
    async getByShareToken(shareToken) {
        try {
            const project = await prisma.project.findUnique({
                where: { shareToken },
                include: {
                    collaborators: {
                        select: { userId: true, role: true }
                    }
                }
            });
            if (!project || !project.shared)
                return null;
            return {
                id: project.id,
                userId: project.userId,
                title: project.title,
                data: project.data,
                updatedAt: project.updatedAt.getTime(),
                createdAt: project.createdAt.getTime(),
                shared: project.shared,
                shareToken: project.shareToken ?? undefined,
                role: 'viewer',
                collaborators: project.collaborators
            };
        }
        catch (e) {
            logger.error('Failed to get project by share token', e);
            return null;
        }
    }
    async save(id, userId, title, data) {
        try {
            let existing;
            let collaborators = [];
            try {
                existing = await prisma.project.findUnique({
                    where: { id },
                    include: { collaborators: true }
                });
                collaborators = existing?.collaborators?.map(c => ({ userId: c.userId, role: c.role })) || [];
            }
            catch {
                // Fallback if collaborators table doesn't exist
                existing = await prisma.project.findUnique({
                    where: { id },
                });
            }
            // Check if user can edit using permission helper
            if (existing) {
                const canEdit = await this.checkPermission(id, userId, 'edit');
                if (!canEdit) {
                    throw new Error('No permission to edit this project');
                }
            }
            let project;
            try {
                project = await prisma.project.upsert({
                    where: { id },
                    create: {
                        id,
                        userId,
                        title,
                        data: data,
                        shared: false,
                    },
                    update: {
                        title,
                        data: data,
                        updatedAt: new Date(),
                    },
                    include: {
                        collaborators: {
                            select: { userId: true, role: true }
                        }
                    }
                });
            }
            catch {
                // Fallback if collaborators table doesn't exist
                project = await prisma.project.upsert({
                    where: { id },
                    create: {
                        id,
                        userId,
                        title,
                        data: data,
                        shared: false,
                    },
                    update: {
                        title,
                        data: data,
                        updatedAt: new Date(),
                    },
                });
            }
            return {
                id: project.id,
                userId: project.userId,
                title: project.title,
                data: project.data,
                updatedAt: project.updatedAt.getTime(),
                createdAt: project.createdAt.getTime(),
                shared: project.shared,
                shareToken: project.shareToken ?? undefined,
                role: 'owner',
                collaborators
            };
        }
        catch (e) {
            logger.error('Failed to save project', e);
            throw e;
        }
    }
    async shareProject(id, userId) {
        try {
            const existing = await prisma.project.findUnique({
                where: { id },
            });
            if (!existing || existing.userId !== userId) {
                return null;
            }
            const shareToken = Math.random().toString(36).slice(2) + Date.now().toString(36);
            const project = await prisma.project.update({
                where: { id },
                data: {
                    shared: true,
                    shareToken,
                },
                include: {
                    collaborators: {
                        select: { userId: true, role: true }
                    }
                }
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
                role: 'owner',
                collaborators: project.collaborators
            };
        }
        catch (e) {
            logger.error('Failed to share project', e);
            return null;
        }
    }
    async unshareProject(id, userId) {
        try {
            const existing = await prisma.project.findUnique({
                where: { id },
            });
            if (!existing || existing.userId !== userId) {
                return null;
            }
            const project = await prisma.project.update({
                where: { id },
                data: {
                    shared: false,
                    shareToken: null,
                },
                include: {
                    collaborators: {
                        select: { userId: true, role: true }
                    }
                }
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
                role: 'owner',
                collaborators: project.collaborators
            };
        }
        catch (e) {
            logger.error('Failed to unshare project', e);
            return null;
        }
    }
    async addCollaborator(projectId, ownerUserId, collaboratorUserId, role = 'editor') {
        try {
            const project = await prisma.project.findUnique({
                where: { id: projectId },
            });
            if (!project || project.userId !== ownerUserId) {
                logger.warn(`Failed to add collaborator: project not found or not owner`, {
                    projectId,
                    ownerUserId,
                    projectUserId: project?.userId
                });
                return false;
            }
            // Can't add owner as collaborator
            if (collaboratorUserId === ownerUserId) {
                logger.warn(`Attempted to add owner as collaborator`, {
                    projectId,
                    userId: ownerUserId
                });
                return false;
            }
            // Extra safety: Check if collaborator is somehow the project owner
            if (collaboratorUserId === project.userId) {
                logger.warn(`Collaborator userId matches project owner`, {
                    projectId,
                    collaboratorUserId,
                    projectUserId: project.userId
                });
                return false;
            }
            await prisma.projectCollaborator.upsert({
                where: {
                    projectId_userId: {
                        projectId,
                        userId: collaboratorUserId
                    }
                },
                create: {
                    projectId,
                    userId: collaboratorUserId,
                    role
                },
                update: {
                    role
                }
            });
            logger.info(`Added collaborator ${collaboratorUserId} with role ${role} to project ${projectId}`);
            return true;
        }
        catch (e) {
            logger.error('Failed to add collaborator', e);
            return false;
        }
    }
    /**
     * Clean up any corrupt data where owners are listed as collaborators
     */
    async cleanupCorruptCollaborators() {
        try {
            const projects = await prisma.project.findMany({
                include: {
                    collaborators: true
                }
            });
            for (const project of projects) {
                const ownerAsCollaborator = project.collaborators.find(c => c.userId === project.userId);
                if (ownerAsCollaborator) {
                    logger.warn(`Found owner as collaborator in project ${project.id}, cleaning up...`);
                    await prisma.projectCollaborator.delete({
                        where: {
                            id: ownerAsCollaborator.id
                        }
                    });
                }
            }
        }
        catch (e) {
            logger.error('Failed to cleanup corrupt collaborators', e);
        }
    }
    async removeCollaborator(projectId, ownerUserId, collaboratorUserId) {
        try {
            const project = await prisma.project.findUnique({
                where: { id: projectId },
            });
            if (!project || project.userId !== ownerUserId) {
                return false;
            }
            await prisma.projectCollaborator.deleteMany({
                where: {
                    projectId,
                    userId: collaboratorUserId
                }
            });
            return true;
        }
        catch (e) {
            logger.error('Failed to remove collaborator', e);
            return false;
        }
    }
    async getCollaborators(projectId, userId) {
        try {
            const project = await prisma.project.findUnique({
                where: { id: projectId },
                include: { collaborators: true }
            });
            if (!project)
                return [];
            // Only owner can view full collaborator list
            if (project.userId !== userId) {
                return [];
            }
            return project.collaborators.map(c => ({ userId: c.userId, role: c.role }));
        }
        catch (e) {
            logger.error('Failed to get collaborators', e);
            return [];
        }
    }
    async create(userId, title, data) {
        try {
            const project = await prisma.project.create({
                data: {
                    userId,
                    title: title || 'Untitled',
                    data: data,
                    shared: false,
                },
                include: {
                    collaborators: {
                        select: { userId: true, role: true }
                    }
                }
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
                role: 'owner',
                collaborators: project.collaborators
            };
        }
        catch (e) {
            logger.error('Failed to create project', e);
            throw e;
        }
    }
    async delete(id, userId) {
        try {
            const existing = await prisma.project.findUnique({
                where: { id },
            });
            if (!existing)
                return false;
            // Only owner can delete
            if (existing.userId !== userId) {
                return false;
            }
            await prisma.project.delete({
                where: { id },
            });
            return true;
        }
        catch (e) {
            logger.error('Failed to delete project', e);
            return false;
        }
    }
    // Folder methods
    async listFolders(userId) {
        try {
            const folders = await prisma.folder.findMany({
                where: { userId },
                include: {
                    _count: {
                        select: { projects: true }
                    }
                },
                orderBy: { name: 'asc' }
            });
            return folders.map(f => ({
                id: f.id,
                userId: f.userId,
                name: f.name,
                color: f.color || '#3b82f6',
                parentId: f.parentId,
                createdAt: f.createdAt.getTime(),
                updatedAt: f.updatedAt.getTime(),
                projectCount: f._count.projects
            }));
        }
        catch (e) {
            logger.error('Failed to list folders', e);
            return [];
        }
    }
    async createFolder(userId, name, color, parentId) {
        try {
            const folder = await prisma.folder.create({
                data: {
                    userId,
                    name,
                    color: color || '#3b82f6',
                    parentId: parentId || null
                },
                include: {
                    _count: {
                        select: { projects: true }
                    }
                }
            });
            return {
                id: folder.id,
                userId: folder.userId,
                name: folder.name,
                color: folder.color || '#3b82f6',
                parentId: folder.parentId,
                createdAt: folder.createdAt.getTime(),
                updatedAt: folder.updatedAt.getTime(),
                projectCount: folder._count.projects
            };
        }
        catch (e) {
            logger.error('Failed to create folder', e);
            throw e;
        }
    }
    async updateFolder(id, userId, name, color, parentId) {
        try {
            const existing = await prisma.folder.findUnique({
                where: { id }
            });
            if (!existing || existing.userId !== userId) {
                return null;
            }
            const folder = await prisma.folder.update({
                where: { id },
                data: {
                    ...(name !== undefined && { name }),
                    ...(color !== undefined && { color }),
                    ...(parentId !== undefined && { parentId })
                },
                include: {
                    _count: {
                        select: { projects: true }
                    }
                }
            });
            return {
                id: folder.id,
                userId: folder.userId,
                name: folder.name,
                color: folder.color || '#3b82f6',
                parentId: folder.parentId,
                createdAt: folder.createdAt.getTime(),
                updatedAt: folder.updatedAt.getTime(),
                projectCount: folder._count.projects
            };
        }
        catch (e) {
            logger.error('Failed to update folder', e);
            return null;
        }
    }
    async deleteFolder(id, userId) {
        try {
            const existing = await prisma.folder.findUnique({
                where: { id }
            });
            if (!existing || existing.userId !== userId) {
                return false;
            }
            // Delete folder (projects will have folderId set to null due to onDelete: SetNull)
            await prisma.folder.delete({
                where: { id }
            });
            return true;
        }
        catch (e) {
            logger.error('Failed to delete folder', e);
            return false;
        }
    }
    async moveToFolder(projectId, userId, folderId) {
        try {
            const project = await prisma.project.findUnique({
                where: { id: projectId }
            });
            if (!project || project.userId !== userId) {
                return false;
            }
            // Verify folder exists and belongs to user (if not null)
            if (folderId) {
                const folder = await prisma.folder.findUnique({
                    where: { id: folderId }
                });
                if (!folder || folder.userId !== userId) {
                    return false;
                }
            }
            await prisma.project.update({
                where: { id: projectId },
                data: { folderId }
            });
            return true;
        }
        catch (e) {
            logger.error('Failed to move project to folder', e);
            return false;
        }
    }
}
//# sourceMappingURL=ProjectService.js.map