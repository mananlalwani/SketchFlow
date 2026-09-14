import { useAuth } from '@clerk/clerk-react';
import { useEffect, useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';
import {
  listProjects,
  createProject,
  deleteProject,
  type ProjectListItem,
  type FolderRecord,
  getProject,
  updateProject,
  listFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  moveProjectToFolder,
} from '@/lib/api';
import { useDrawingStore } from '@/store/drawingStore';
import { installProjectSession } from '@/lib/projectSession';
import { serializeProject } from '@/lib/utils';
import { DRAW_FORMAT_EXTENSION } from '@/lib/drawFormat';
import { exportPersistedProject, type ProjectExportFormat } from '@/lib/projectExport';
import { importProjectFile } from '@/lib/projectImport';
import { useToast } from '@/hooks/use-toast';
import {
  ALL_NOTES_FOLDER_ID,
  filterAndSortProjects,
  getLastProject,
  getRecentProjects,
  type ProjectSortOption,
} from '@/lib/projectList';
import { useProjectLibraryState } from '@/components/projectManager/useProjectLibraryState';

export const FOLDER_COLORS = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Teal', value: '#14b8a6' },
];

export function useProjectLibrary(onSelect?: () => void) {
  const { getToken, userId, isLoaded } = useAuth();
  const { isGuest, isAuthenticated } = useAuthStore();
  const { toast } = useToast();
  const library = useProjectLibraryState();
  const {
    projects,
    setProjects,
    folders,
    setFolders,
    guestBannerDismissed,
    setGuestBannerDismissed,
    loading,
    setLoading,
    creating,
    setCreating,
    lastProjectId,
    setLastProjectId,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    sortDirection,
    setSortDirection,
    isMobile,
    showFolderNavigation,
    viewMode,
    setViewMode,
    renamingId,
    setRenamingId,
    renameValue,
    setRenameValue,
    selectedFolderId,
    setSelectedFolderId,
    renamingFolderId,
    setRenamingFolderId,
    folderRenameValue,
    setFolderRenameValue,
    creatingFolder,
    setCreatingFolder,
    newFolderName,
    setNewFolderName,
    sharingProject,
    setSharingProject,
    openMenuId,
    setOpenMenuId,
    showNewProjectDialog,
    setShowNewProjectDialog,
    newProjectName,
    setNewProjectName,
    mobileRenameProject,
    setMobileRenameProject,
    mobileRenameValue,
    setMobileRenameValue,
    isRenamingMobileProject,
    setIsRenamingMobileProject,
    menuClosedAtRef,
  } = library;

  const handleCardClick = (projectId: string, e: React.MouseEvent) => {
    // Check if click originated from within a dropdown menu (rendered in portal)
    if (
      e.target instanceof HTMLElement &&
      (e.target.closest('[role="menu"]') || e.target.closest('[data-radix-popper-content-wrapper]'))
    ) {
      return;
    }

    // Ignore clicks within 500ms of menu closing
    if (Date.now() - menuClosedAtRef.current < 500) {
      return;
    }
    // Also ignore if menu is currently open
    if (openMenuId) {
      return;
    }
    handleLoad(projectId);
  };

  const handleMenuOpenChange = (open: boolean, projectId: string) => {
    if (open) {
      setOpenMenuId(projectId);
    } else {
      setOpenMenuId(null);
      menuClosedAtRef.current = Date.now();
    }
  };

  const { currentProjectId, setProjectRevision } = useDrawingStore();

  const handleDismissBanner = () => {
    setGuestBannerDismissed(true);
    localStorage.setItem('guest-banner-dismissed', 'true');
  };

  const loadData = async () => {
    setLoading(true);
    try {
      if (isGuest) {
        // For guests, load local projects only
        const projectList = await listProjects(null);
        setProjects(
          projectList
            .filter((p) => p && p.id)
            .map((p) => ({
              ...p,
              shared: p.shared ?? false,
              role: p.role ?? 'owner',
            })),
        );
        setFolders([]);
      } else if (userId) {
        // For authenticated users, load from server
        const token = await getToken();
        const [projectList, folderList] = await Promise.all([
          listProjects(token),
          listFolders(token).catch((): FolderRecord[] => []),
        ]);
        setProjects(
          projectList
            .filter((p) => p && p.id)
            .map((p) => {
              // Correct the role if it's wrong: if userId matches project userId, user is owner
              let correctedRole = p.role ?? 'owner';
              if (p.userId === userId) {
                correctedRole = 'owner';
                if (p.role && p.role !== 'owner') {
                  console.warn(`Corrected role for project ${p.id}: was ${p.role}, now owner`, {
                    projectId: p.id,
                    userId,
                    projectUserId: p.userId,
                  });
                }
              }

              return {
                ...p,
                shared: p.shared ?? false,
                role: correctedRole,
              };
            }),
        );
        setFolders(folderList);
      }
    } catch (e) {
      console.error('Failed to load projects:', e);
      // For guests, an empty list is fine (they might be new)
      // Only show error toast for authenticated users
      if (!isGuest) {
        toast({ title: 'Failed to load projects', variant: 'destructive' });
      }
      // Set empty arrays so UI can still render
      setProjects([]);
      setFolders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoaded) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, userId, isGuest]);

  // Reset banner dismissal when user signs in
  useEffect(() => {
    if (isAuthenticated) {
      localStorage.removeItem('guest-banner-dismissed');
      setGuestBannerDismissed(false);
    }
  }, [isAuthenticated]);

  const filteredProjects = useMemo(
    () => filterAndSortProjects(projects, searchQuery, selectedFolderId, sortBy, sortDirection),
    [projects, searchQuery, sortBy, sortDirection, selectedFolderId],
  );

  const recentProjects = useMemo(() => getRecentProjects(projects), [projects]);
  const lastProject = useMemo(
    () => getLastProject(projects, lastProjectId),
    [projects, lastProjectId],
  );

  const currentFolderName = useMemo(() => {
    if (selectedFolderId === ALL_NOTES_FOLDER_ID) return 'All notes';
    if (selectedFolderId === null) return 'Unfiled notes';
    const folder = folders.find((folder) => folder.id === selectedFolderId);
    return folder?.name || 'All notes';
  }, [folders, selectedFolderId]);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const token = await getToken();
      await createFolder(newFolderName.trim(), '#f59e0b', null, token);
      setNewFolderName('');
      setCreatingFolder(false);
      await loadData();
      toast({ title: 'Folder created' });
    } catch {
      toast({ title: 'Failed to create folder', variant: 'destructive' });
    }
  };

  const handleRenameFolder = async (id: string) => {
    if (!folderRenameValue.trim()) {
      setRenamingFolderId(null);
      return;
    }
    try {
      const token = await getToken();
      await updateFolder(id, folderRenameValue.trim(), undefined, undefined, token);
      setRenamingFolderId(null);
      await loadData();
      toast({ title: 'Folder renamed' });
    } catch {
      toast({ title: 'Failed to rename folder', variant: 'destructive' });
    }
  };

  const handleDeleteFolder = async (id: string) => {
    if (!confirm('Delete this folder? Notes inside will be moved to "Unfiled notes".')) return;
    try {
      const token = await getToken();
      await deleteFolder(id, token);
      if (selectedFolderId === id) setSelectedFolderId(null);
      await loadData();
      toast({ title: 'Folder deleted' });
    } catch {
      toast({ title: 'Failed to delete folder', variant: 'destructive' });
    }
  };

  const handleMoveToFolder = async (projectId: string, folderId: string | null) => {
    try {
      const token = await getToken();
      await moveProjectToFolder(projectId, folderId, token);

      // Get the old folderId before updating
      const oldFolderId = projects.find((p) => p.id === projectId)?.folderId;

      // Update projects state
      setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, folderId } : p)));

      // Update folder counts
      setFolders((prev) =>
        prev.map((f) => {
          if (f.id === oldFolderId) {
            // Decrement old folder count
            return { ...f, projectCount: Math.max(0, (f.projectCount || 1) - 1) };
          }
          if (f.id === folderId) {
            // Increment new folder count
            return { ...f, projectCount: (f.projectCount || 0) + 1 };
          }
          return f;
        }),
      );

      toast({ title: folderId ? 'Moved to folder' : 'Moved to Unfiled notes' });
    } catch {
      toast({ title: 'Failed to move note', variant: 'destructive' });
    }
  };

  const openNewProjectDialog = () => {
    setNewProjectName('');
    setShowNewProjectDialog(true);
  };

  const getActiveFolderId = () =>
    selectedFolderId && selectedFolderId !== ALL_NOTES_FOLDER_ID ? selectedFolderId : null;

  // Guest-friendly: Create a local project and start drawing immediately
  const handleCreateGuestProject = async () => {
    const projectName = 'Untitled note';
    setCreating(true);
    try {
      const emptyProjectData = serializeProject([], 4096, 4096);
      // For guests, createProject will route to local storage
      const newProj = await createProject(projectName, emptyProjectData, null);
      await handleLoad(newProj.id);
      if (onSelect) onSelect();
    } catch (e) {
      console.error('Create local project error:', e);
      toast({ title: 'Failed to create note', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleQuickCreate = async () => {
    if (!userId) {
      await handleCreateGuestProject();
      return;
    }

    setCreating(true);
    try {
      const token = await getToken();
      const emptyProjectData = serializeProject([], 4096, 4096);
      const newProj = await createProject('Untitled note', emptyProjectData, token);
      const activeFolderId = getActiveFolderId();
      if (activeFolderId) {
        await moveProjectToFolder(newProj.id, activeFolderId, token);
      }
      await handleLoad(newProj.id);
    } catch (e) {
      console.error('Quick note creation error:', e);
      toast({ title: 'Failed to create note', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleCreate = async () => {
    if (!userId) {
      // For guests, create local project directly
      await handleCreateGuestProject();
      return;
    }
    const projectName = newProjectName.trim() || 'Untitled note';
    setCreating(true);
    setShowNewProjectDialog(false);
    try {
      const token = await getToken();
      const emptyProjectData = serializeProject([], 4096, 4096);
      const newProj = await createProject(projectName, emptyProjectData, token);

      const activeFolderId = getActiveFolderId();
      if (activeFolderId) {
        await moveProjectToFolder(newProj.id, activeFolderId, token);
      }

      await handleLoad(newProj.id);
    } catch (e) {
      console.error('Create note error:', e);
      toast({ title: 'Failed to create note', variant: 'destructive' });
    } finally {
      setCreating(false);
      setNewProjectName('');
    }
  };

  const handleLoad = async (id: string) => {
    try {
      const token = await getToken();
      const record = await getProject(id, token);
      installProjectSession(record, isGuest ? 'owner' : record.role || 'owner');

      localStorage.setItem('lastProjectId', record.id);
      setLastProjectId(record.id);

      if (onSelect) onSelect();
    } catch (e) {
      console.error(e);
      toast({ title: 'Failed to load note', variant: 'destructive' });
    }
  };

  const handleRename = async (id: string) => {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    try {
      const token = await getToken();
      const record = await getProject(id, token);
      const updated = await updateProject(
        id,
        renameValue.trim(),
        record.data,
        token,
        undefined,
        record.revision,
      );
      setProjects((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, title: updated.title, revision: updated.revision } : p,
        ),
      );
      if (currentProjectId === id) setProjectRevision(updated.revision);
      setRenamingId(null);
      toast({ title: 'Note renamed' });
    } catch {
      toast({ title: 'Failed to rename', variant: 'destructive' });
    }
  };

  const handleMobileRename = async () => {
    if (!mobileRenameProject || !mobileRenameValue.trim()) return;

    setIsRenamingMobileProject(true);
    try {
      const token = await getToken();
      const record = await getProject(mobileRenameProject.id, token);
      const updated = await updateProject(
        mobileRenameProject.id,
        mobileRenameValue.trim(),
        record.data,
        token,
        undefined,
        record.revision,
      );
      setProjects((prev) =>
        prev.map((project) =>
          project.id === mobileRenameProject.id
            ? { ...project, title: updated.title, revision: updated.revision }
            : project,
        ),
      );
      if (currentProjectId === mobileRenameProject.id) setProjectRevision(updated.revision);
      setMobileRenameProject(null);
      toast({ title: 'Note renamed' });
    } catch {
      toast({ title: 'Failed to rename', variant: 'destructive' });
    } finally {
      setIsRenamingMobileProject(false);
    }
  };

  const handleDeleteProject = async (project: ProjectListItem) => {
    if (!confirm('Are you sure you want to delete this note?')) return;
    try {
      const token = await getToken();
      await deleteProject(project.id, token);
      setProjects((previous) => previous.filter((candidate) => candidate.id !== project.id));
      if (lastProjectId === project.id) {
        localStorage.removeItem('lastProjectId');
        setLastProjectId(null);
      }
      if (currentProjectId === project.id) useDrawingStore.getState().newProject();
      toast({ title: 'Note deleted' });
    } catch {
      toast({ title: 'Failed to delete', variant: 'destructive' });
    }
  };

  const handleExport = async (projectId: string, title: string, format: ProjectExportFormat) => {
    try {
      const token = await getToken();
      await exportPersistedProject({ projectId, title, token, format });
      toast({ title: `Exported as ${format === 'dra' ? '.dra' : format.toUpperCase()}` });
    } catch (e) {
      console.error(e);
      toast({ title: 'Export failed', variant: 'destructive' });
    }
  };

  const handleExportPNG = (projectId: string, title: string) =>
    handleExport(projectId, title, 'png');
  const handleExportPDF = (projectId: string, title: string) =>
    handleExport(projectId, title, 'pdf');
  const handleExportDRA = (projectId: string, title: string) =>
    handleExport(projectId, title, 'dra');

  const handleImportDRA = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = DRAW_FORMAT_EXTENSION;
    input.onchange = async (e) => {
      const file = e.target instanceof HTMLInputElement ? e.target.files?.[0] : undefined;
      if (!file) return;

      try {
        const token = await getToken();
        await importProjectFile(file, token);
        await loadData();
        toast({ title: 'Note imported successfully' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid file format';
        toast({ title: 'Import failed', description: message, variant: 'destructive' });
      }
    };
    input.click();
  };

  const handleImportPDF = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.onchange = async (e) => {
      const file = e.target instanceof HTMLInputElement ? e.target.files?.[0] : undefined;
      if (!file) return;

      try {
        toast({ title: 'Processing PDF...', description: 'This may take a moment.' });

        const token = await getToken();
        const result = await importProjectFile(file, token);
        await loadData();
        toast({
          title: 'PDF imported successfully',
          description: `${result.pageCount} page(s) imported.`,
        });
      } catch (err) {
        console.error('PDF import error:', err);
        const message = err instanceof Error ? err.message : 'Failed to process PDF';
        toast({ title: 'Import failed', description: message, variant: 'destructive' });
      }
    };
    input.click();
  };

  const toggleSort = (option: ProjectSortOption) => {
    if (sortBy === option) {
      setSortDirection((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(option);
      setSortDirection('desc');
    }
  };

  const handleDuplicate = async (project: ProjectListItem) => {
    try {
      const token = await getToken();
      const record = await getProject(project.id, token);
      await createProject(`${project.title} (Copy)`, record.data, token);
      await loadData();
      toast({ title: 'Project duplicated' });
    } catch {
      toast({ title: 'Failed to duplicate', variant: 'destructive' });
    }
  };

  const handleFolderColor = async (
    folder: FolderRecord,
    color: string,
  ) => {
    const token = await getToken();
    await updateFolder(folder.id, folder.name, color, folder.parentId, token);
    await loadData();
  };

  return {
    projects,
    setProjects,
    folders,
    setFolders,
    guestBannerDismissed,
    setGuestBannerDismissed,
    loading,
    setLoading,
    creating,
    setCreating,
    lastProjectId,
    setLastProjectId,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    sortDirection,
    setSortDirection,
    viewMode,
    setViewMode,
    renamingId,
    setRenamingId,
    renameValue,
    setRenameValue,
    selectedFolderId,
    setSelectedFolderId,
    renamingFolderId,
    setRenamingFolderId,
    folderRenameValue,
    setFolderRenameValue,
    creatingFolder,
    setCreatingFolder,
    newFolderName,
    setNewFolderName,
    sharingProject,
    setSharingProject,
    openMenuId,
    setOpenMenuId,
    showNewProjectDialog,
    setShowNewProjectDialog,
    newProjectName,
    setNewProjectName,
    mobileRenameProject,
    setMobileRenameProject,
    mobileRenameValue,
    setMobileRenameValue,
    isRenamingMobileProject,
    setIsRenamingMobileProject,
    isLoaded,
    userId,
    getToken,
    isGuest,
    isAuthenticated,
    toast,
    isMobile,
    showFolderNavigation,
    handleCardClick,
    handleMenuOpenChange,
    currentProjectId,
    setProjectRevision,
    handleDismissBanner,
    filteredProjects,
    recentProjects,
    lastProject,
    currentFolderName,
    handleCreateFolder,
    handleRenameFolder,
    handleDeleteFolder,
    handleMoveToFolder,
    openNewProjectDialog,
    handleCreateGuestProject,
    handleQuickCreate,
    handleCreate,
    handleLoad,
    handleRename,
    handleMobileRename,
    handleDeleteProject,
    handleExportPNG,
    handleExportPDF,
    handleExportDRA,
    handleImportDRA,
    handleImportPDF,
    loadData,
    toggleSort,
    menuClosedAtRef,
    handleDuplicate,
    handleFolderColor,
  };
}

export type ProjectLibrary = ReturnType<typeof useProjectLibrary>;
