import type express from 'express';
import { requireAuthenticatedUser } from '../middleware/auth.js';
import type { ProjectService } from '../services/ProjectService.js';
import type { AuthenticatedRequest } from '../types/http.js';
import { folderInputSchema } from '../validation/project.js';

/** Owns the authenticated folder HTTP interface and its status mapping. */
export function registerFolderRoutes(app: express.Express, projects: ProjectService): void {
  app.get('/api/folders', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      res.json(await projects.listFolders(req.auth!.userId!));
    } catch {
      res.status(500).json({ error: 'Failed to list folders' });
    }
  });

  app.post('/api/folders', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = folderInputSchema.safeParse(req.body);
      if (!parsed.success || !parsed.data.name) {
        return res.status(400).json({ error: 'Invalid folder payload' });
      }
      const { name, color, parentId } = parsed.data;
      res.json(await projects.createFolder(req.auth!.userId!, name, color, parentId));
    } catch {
      res.status(500).json({ error: 'Failed to create folder' });
    }
  });

  app.put('/api/folders/:id', requireAuthenticatedUser, async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = folderInputSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid folder payload' });
      const { name, color, parentId } = parsed.data;
      const folder = await projects.updateFolder(
        req.params.id,
        req.auth!.userId!,
        name,
        color,
        parentId,
      );
      if (!folder) return res.status(404).json({ error: 'Folder not found' });
      res.json(folder);
    } catch {
      res.status(500).json({ error: 'Failed to update folder' });
    }
  });

  app.delete(
    '/api/folders/:id',
    requireAuthenticatedUser,
    async (req: AuthenticatedRequest, res) => {
      try {
        const deleted = await projects.deleteFolder(req.params.id, req.auth!.userId!);
        if (!deleted) return res.status(404).json({ error: 'Folder not found' });
        res.json({ success: true });
      } catch {
        res.status(500).json({ error: 'Failed to delete folder' });
      }
    },
  );
}
