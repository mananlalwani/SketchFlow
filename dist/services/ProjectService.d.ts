export interface ProjectRecord {
    id: string;
    userId: string;
    title: string;
    updatedAt: number;
    createdAt: number;
    data: unknown;
    shared?: boolean;
    shareToken?: string;
    folderId?: string | null;
    role: 'owner' | 'editor' | 'viewer';
    collaborators?: {
        userId: string;
        role: string;
    }[];
}
export interface FolderRecord {
    id: string;
    userId: string;
    name: string;
    color: string;
    parentId: string | null;
    createdAt: number;
    updatedAt: number;
    projectCount?: number;
}
export declare class ProjectService {
    checkPermission(projectId: string, userId: string, action: 'view' | 'edit' | 'delete' | 'share' | 'manage'): Promise<boolean>;
    list(userId: string): Promise<Omit<ProjectRecord, 'data'>[]>;
    get(id: string, userId?: string): Promise<ProjectRecord | null>;
    getByShareToken(shareToken: string): Promise<ProjectRecord | null>;
    save(id: string, userId: string, title: string, data: unknown): Promise<ProjectRecord>;
    shareProject(id: string, userId: string): Promise<ProjectRecord | null>;
    unshareProject(id: string, userId: string): Promise<ProjectRecord | null>;
    addCollaborator(projectId: string, ownerUserId: string, collaboratorUserId: string, role?: 'editor' | 'viewer'): Promise<boolean>;
    /**
     * Clean up any corrupt data where owners are listed as collaborators
     */
    cleanupCorruptCollaborators(): Promise<void>;
    removeCollaborator(projectId: string, ownerUserId: string, collaboratorUserId: string): Promise<boolean>;
    getCollaborators(projectId: string, userId: string): Promise<{
        userId: string;
        role: string;
    }[]>;
    create(userId: string, title: string, data: unknown): Promise<ProjectRecord>;
    delete(id: string, userId: string): Promise<boolean>;
    listFolders(userId: string): Promise<FolderRecord[]>;
    createFolder(userId: string, name: string, color?: string, parentId?: string | null): Promise<FolderRecord>;
    updateFolder(id: string, userId: string, name?: string, color?: string, parentId?: string | null): Promise<FolderRecord | null>;
    deleteFolder(id: string, userId: string): Promise<boolean>;
    moveToFolder(projectId: string, userId: string, folderId: string | null): Promise<boolean>;
}
//# sourceMappingURL=ProjectService.d.ts.map