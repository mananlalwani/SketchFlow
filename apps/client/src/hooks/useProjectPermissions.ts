import { useMemo } from 'react';
import { useDrawingStore } from '@/store/drawingStore';

export type ProjectRole = 'owner' | 'editor' | 'viewer' | null;

export function useProjectPermissions() {
  const { projectRole } = useDrawingStore();

  const permissions = useMemo(() => {
    const role = projectRole;

    return {
      canView: role !== null,
      canEdit: role === 'owner' || role === 'editor',
      canDelete: role === 'owner',
      canShare: role === 'owner',
      canManage: role === 'owner',
      canDraw: role === 'owner' || role === 'editor',
      role,
    };
  }, [projectRole]);

  return permissions;
}
