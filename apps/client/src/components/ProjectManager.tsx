import { useAuth } from '@clerk/clerk-react';
import { useEffect, useState, useMemo, useRef } from 'react';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Plus,
  FolderOpen,
  Trash2,
  Clock,
  Loader2,
  FileEdit,
  Users,
  Search,
  Grid3X3,
  List,
  SortAsc,
  SortDesc,
  Copy,
  Download,
  Upload,
  Image,
  FileText,
  FileArchive,
  Sparkles,
  Calendar,
  Type,
  MoreHorizontal,
  Pencil,
  Folder,
  FolderPlus,
  Home,
  FolderInput,
  Share2,
  X,
  Info,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow, format } from 'date-fns';
import { ProjectShareDialog } from '@/components/ProjectShareDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
  DrawerClose,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { useMobile } from '@/hooks/useMobile';
import {
  filterAndSortProjects,
  type ProjectSortDirection,
  type ProjectSortOption,
} from '@/lib/projectList';

type SortOption = ProjectSortOption;
type SortDirection = ProjectSortDirection;
type ViewMode = 'grid' | 'list';

const FOLDER_COLORS = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Teal', value: '#14b8a6' },
];

export function ProjectManager({ onSelect }: { onSelect?: () => void }) {
  const { getToken, userId, isLoaded } = useAuth();
  const { isGuest, isAuthenticated } = useAuthStore();
  const { toast } = useToast();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [guestBannerDismissed, setGuestBannerDismissed] = useState(() => {
    return localStorage.getItem('guest-banner-dismissed') === 'true';
  });
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('updated');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const isMobile = useMobile();
  // Folders are useful for a broad desktop library, but add too much
  // navigation overhead on a phone.
  const showFolderNavigation = !isMobile;
  const [viewMode, setViewMode] = useState<ViewMode>(isMobile ? 'list' : 'grid');

  useEffect(() => {
    if (isMobile) {
      setViewMode('list');
    }
  }, [isMobile]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [folderRenameValue, setFolderRenameValue] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [sharingProject, setSharingProject] = useState<ProjectListItem | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [mobileRenameProject, setMobileRenameProject] = useState<ProjectListItem | null>(null);
  const [mobileRenameValue, setMobileRenameValue] = useState('');
  const [isRenamingMobileProject, setIsRenamingMobileProject] = useState(false);

  // Track when menu was last closed to ignore clicks right after
  const menuClosedAtRef = useRef<number>(0);

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
    () =>
      filterAndSortProjects(
        projects,
        searchQuery,
        showFolderNavigation ? selectedFolderId : null,
        sortBy,
        sortDirection,
      ),
    [projects, searchQuery, showFolderNavigation, sortBy, sortDirection, selectedFolderId],
  );

  const currentFolderName = useMemo(() => {
    if (!showFolderNavigation || selectedFolderId === null) return 'Projects';
    const folder = folders.find((folder) => folder.id === selectedFolderId);
    return folder?.name || 'Projects';
  }, [folders, selectedFolderId, showFolderNavigation]);

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
    if (!confirm('Delete this folder? Projects inside will be moved to "All Projects".')) return;
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

      toast({ title: folderId ? 'Moved to folder' : 'Moved to All Projects' });
    } catch {
      toast({ title: 'Failed to move project', variant: 'destructive' });
    }
  };

  const openNewProjectDialog = () => {
    setNewProjectName('');
    setShowNewProjectDialog(true);
  };

  // Guest-friendly: Create a local project and start drawing immediately
  const handleCreateGuestProject = async () => {
    const projectName = 'My Drawing';
    setCreating(true);
    try {
      const emptyProjectData = serializeProject([], 4096, 4096);
      // For guests, createProject will route to local storage
      const newProj = await createProject(projectName, emptyProjectData, null);
      await handleLoad(newProj.id);
      if (onSelect) onSelect();
    } catch (e) {
      console.error('Create local project error:', e);
      toast({ title: 'Failed to create project', variant: 'destructive' });
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
    const projectName = newProjectName.trim() || 'Untitled Project';
    setCreating(true);
    setShowNewProjectDialog(false);
    try {
      const token = await getToken();
      const emptyProjectData = serializeProject([], 4096, 4096);
      const newProj = await createProject(projectName, emptyProjectData, token);

      if (showFolderNavigation && selectedFolderId) {
        await moveProjectToFolder(newProj.id, selectedFolderId, token);
      }

      await handleLoad(newProj.id);
    } catch (e) {
      console.error('Create project error:', e);
      toast({ title: 'Failed to create project', variant: 'destructive' });
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

      if (onSelect) onSelect();
    } catch (e) {
      console.error(e);
      toast({ title: 'Failed to load project', variant: 'destructive' });
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
      toast({ title: 'Project renamed' });
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
      toast({ title: 'Project renamed' });
    } catch {
      toast({ title: 'Failed to rename', variant: 'destructive' });
    } finally {
      setIsRenamingMobileProject(false);
    }
  };

  const handleDeleteProject = async (project: ProjectListItem) => {
    if (!confirm('Are you sure you want to delete this project?')) return;
    try {
      const token = await getToken();
      await deleteProject(project.id, token);
      setProjects((previous) => previous.filter((candidate) => candidate.id !== project.id));
      if (currentProjectId === project.id) useDrawingStore.getState().newProject();
      toast({ title: 'Project deleted' });
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
        toast({ title: 'Project imported successfully' });
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

  const toggleSort = (option: SortOption) => {
    if (sortBy === option) {
      setSortDirection((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(option);
      setSortDirection('desc');
    }
  };

  if (!isLoaded)
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-slate-400" />
      </div>
    );

  // Don't block guests - they can use local storage
  // if (!userId && !isGuest) {
  //   return (
  //     <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
  //       <Cloud className="w-16 h-16 text-slate-400 dark:text-slate-600 mb-4" />
  //       <h2 className="text-2xl font-bold mb-2 text-slate-900 dark:text-slate-100">Cloud Sync</h2>
  //       <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-sm">Sign in to save your drawings to the cloud and access them from anywhere.</p>
  //       <div className="text-sm text-slate-500">Use the Sign In button in the top right.</div>
  //     </div>
  //   );
  // }

  return (
    <>
      <div className="flex h-full w-full flex-col bg-[#fbfaf7] text-stone-900 transition-colors duration-200 dark:bg-[#171513] dark:text-stone-100">
        {/* Guest Mode Banner - Dismissable */}
        {isGuest && !guestBannerDismissed && (
          <div className="border-b border-amber-200/80 bg-amber-50 px-6 py-3 dark:border-amber-400/15 dark:bg-amber-300/[0.07]">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-300 text-stone-950 shadow-sm shadow-amber-950/10">
                  <Info className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-stone-900 dark:text-amber-100">
                    You're in Guest Mode
                  </p>
                  <p className="text-xs text-stone-600 dark:text-stone-400">
                    Projects are saved locally. Sign in to sync and collaborate.
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Dismiss guest mode notice"
                onClick={handleDismissBanner}
                className="h-8 w-8 p-0 hover:bg-amber-200/70 dark:hover:bg-amber-300/10"
              >
                <X className="h-4 w-4 text-stone-700 dark:text-amber-200" />
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          {/* Folder Sidebar */}
          <div
            className={`${showFolderNavigation ? 'hidden md:flex' : 'hidden'} w-64 shrink-0 flex-col border-r border-stone-200/90 bg-stone-100/55 transition-colors duration-200 dark:border-white/[0.08] dark:bg-stone-950/50`}
          >
            <div className="border-b border-stone-200/90 px-4 py-4 dark:border-white/[0.08]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-600 dark:text-stone-400">
                    Library
                  </p>
                  <p className="mt-1 text-sm font-semibold tracking-[-0.02em] text-stone-900 dark:text-stone-100">
                    {isGuest ? 'Local projects' : 'Folders'}
                  </p>
                </div>
                {!isGuest && (
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="New folder"
                    className="h-8 w-8 border-stone-300 bg-stone-50 text-stone-600 hover:bg-white hover:text-stone-950 dark:border-white/[0.1] dark:bg-white/[0.035] dark:text-stone-300 dark:hover:bg-white/[0.08] dark:hover:text-stone-50"
                    onClick={() => setCreatingFolder(true)}
                    title="New Folder"
                  >
                    <FolderPlus className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="flex-1 space-y-1 overflow-y-auto p-2.5">
              <button
                onClick={() => setSelectedFolderId(null)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                  selectedFolderId === null && !searchQuery
                    ? 'bg-stone-900 text-amber-100 shadow-sm dark:bg-amber-300 dark:text-stone-950'
                    : 'text-stone-600 dark:text-stone-400 hover:bg-stone-200/70 hover:text-stone-950 dark:hover:bg-white/[0.06] dark:hover:text-stone-100'
                }`}
              >
                <Home className="w-4 h-4" />
                <span className="truncate flex-1">Unsorted</span>
                <span className="text-xs font-medium opacity-60">
                  {projects.filter((p) => !p.folderId).length}
                </span>
                {/* Spacer to align with folder dropdown buttons */}
                <div className="w-6 h-6" />
              </button>

              {folders.map((folder) => (
                <div key={folder.id} className="group">
                  {renamingFolderId === folder.id ? (
                    <Input
                      value={folderRenameValue}
                      onChange={(e) => setFolderRenameValue(e.target.value)}
                      onBlur={() => handleRenameFolder(folder.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameFolder(folder.id);
                        if (e.key === 'Escape') setRenamingFolderId(null);
                      }}
                      className="h-8 text-sm"
                      autoFocus
                    />
                  ) : (
                    <div
                      className={`group flex items-center gap-1 rounded-lg transition-colors ${
                        selectedFolderId === folder.id
                          ? 'bg-stone-900 text-amber-100 shadow-sm dark:bg-amber-300 dark:text-stone-950'
                          : 'text-stone-600 hover:bg-stone-200/70 hover:text-stone-950 dark:text-stone-400 dark:hover:bg-white/[0.06] dark:hover:text-stone-100'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedFolderId(folder.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left text-sm"
                      >
                        <Folder className="h-4 w-4 shrink-0" style={{ color: folder.color }} />
                        <span className="flex-1 truncate">{folder.name}</span>
                        <span className="text-xs font-medium opacity-60">
                          {folder.projectCount || 0}
                        </span>
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          asChild
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Actions for ${folder.name}`}
                            className="mr-1 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                          >
                            <MoreHorizontal className="w-3 h-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            onSelect={() => {
                              setFolderRenameValue(folder.name);
                              setRenamingFolderId(folder.id);
                            }}
                          >
                            <Pencil className="w-4 h-4 mr-2" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                              <div
                                className="w-3 h-3 rounded-full mr-2"
                                style={{ backgroundColor: folder.color }}
                              />
                              Color
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                              {FOLDER_COLORS.map((c) => (
                                <DropdownMenuItem
                                  key={c.value}
                                  onSelect={async () => {
                                    const token = await getToken();
                                    await updateFolder(
                                      folder.id,
                                      folder.name,
                                      c.value,
                                      folder.parentId,
                                      token,
                                    );
                                    await loadData();
                                  }}
                                >
                                  <div
                                    className="w-4 h-4 rounded-full mr-2"
                                    style={{ backgroundColor: c.value }}
                                  />
                                  {c.name}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => handleDeleteFolder(folder.id)}
                            className="text-red-500 dark:text-red-400 focus:text-red-500 dark:focus:text-red-400"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Main Content */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* Header */}
            <div className="border-b border-stone-200/90 bg-stone-50/70 px-4 pb-4 pt-5 transition-colors duration-200 dark:border-white/[0.08] dark:bg-stone-950/35 sm:px-7 sm:pb-5 sm:pt-7">
              <div className="mb-3 flex items-start justify-between gap-3 sm:mb-4 sm:items-center">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 text-xl font-semibold tracking-[-0.035em] text-stone-900 dark:text-stone-100 sm:text-2xl">
                    {showFolderNavigation && selectedFolderId ? (
                      <Folder className="h-6 w-6 text-amber-600 dark:text-amber-300" />
                    ) : (
                      <FolderOpen className="h-6 w-6 text-amber-600 dark:text-amber-300" />
                    )}
                    {currentFolderName}
                  </h2>
                  <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                    {filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''}
                    {searchQuery && ` matching "${searchQuery}"`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-stone-300 dark:border-white/10"
                        title="Import project"
                        aria-label="Import project"
                      >
                        <Upload className="mr-0 h-4 w-4 sm:mr-2" />
                        <span className="hidden sm:inline">Import</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={handleImportDRA}>
                        <FileArchive className="w-4 h-4 mr-2" />
                        Import .dra file
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={handleImportPDF}>
                        <FileText className="w-4 h-4 mr-2" />
                        Import PDF
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    onClick={openNewProjectDialog}
                    disabled={creating}
                    className="bg-stone-900 text-stone-50 hover:bg-stone-700 dark:bg-amber-300 dark:text-stone-950 dark:hover:bg-amber-200"
                  >
                    {creating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-2 h-4 w-4" />
                    )}
                    <span className="sm:hidden">New</span>
                    <span className="hidden sm:inline">New Project</span>
                  </Button>
                </div>
              </div>

              {showFolderNavigation && isMobile && (
                <div className="mb-3">
                  <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <button
                      type="button"
                      onClick={() => setSelectedFolderId(null)}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        selectedFolderId === null && !searchQuery
                          ? 'bg-amber-300 text-stone-950'
                          : 'bg-stone-100 text-stone-600 dark:bg-stone-900 dark:text-stone-300'
                      }`}
                    >
                      All projects
                    </button>
                    {folders.map((folder) => (
                      <button
                        key={folder.id}
                        type="button"
                        onClick={() => setSelectedFolderId(folder.id)}
                        className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                          selectedFolderId === folder.id
                            ? 'bg-amber-300 text-stone-950'
                            : 'bg-stone-100 text-stone-600 dark:bg-stone-900 dark:text-stone-300'
                        }`}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: folder.color }}
                        />
                        {folder.name}
                      </button>
                    ))}
                    {!isGuest && (
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-8 w-8 shrink-0 rounded-full"
                        aria-label="New folder"
                        onClick={() => setCreatingFolder(true)}
                      >
                        <FolderPlus className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* New Project Dialog */}
              <Dialog open={showNewProjectDialog} onOpenChange={setShowNewProjectDialog}>
                <DialogContent className="gap-0 overflow-hidden border-stone-200 bg-stone-50 p-0 sm:max-w-md dark:border-white/[0.09] dark:bg-[#211e1b]">
                  <DialogHeader className="border-b border-stone-200 bg-stone-100/80 px-6 pb-5 pt-6 text-left dark:border-white/[0.08] dark:bg-white/[0.025]">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-900 text-amber-200 shadow-sm shadow-stone-950/15 dark:bg-amber-300 dark:text-stone-950">
                        <Plus className="h-5 w-5" strokeWidth={2.25} />
                      </span>
                      <div>
                        <DialogTitle className="text-xl font-semibold tracking-[-0.04em] text-stone-950 dark:text-stone-50">
                          New project
                        </DialogTitle>
                        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                          Start with a clean canvas.
                        </p>
                      </div>
                    </div>
                  </DialogHeader>
                  <div className="px-6 py-5">
                    <label className="grid gap-2 text-sm font-medium text-stone-700 dark:text-stone-200">
                      Project name
                      <Input
                        placeholder="Untitled project"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreate();
                          if (e.key === 'Escape') setShowNewProjectDialog(false);
                        }}
                        className="border-stone-300 bg-white dark:border-white/[0.1] dark:bg-stone-950/30"
                        autoFocus
                      />
                    </label>
                    <p className="mt-3 text-xs leading-5 text-stone-500 dark:text-stone-400">
                      You can rename this anytime from the project menu.
                    </p>
                  </div>
                  <DialogFooter className="border-t border-stone-200 bg-stone-100/50 px-6 py-4 dark:border-white/[0.08] dark:bg-white/[0.02]">
                    <Button
                      variant="outline"
                      className="border-stone-300 dark:border-white/[0.1]"
                      onClick={() => setShowNewProjectDialog(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="bg-stone-900 text-amber-100 hover:bg-stone-800 dark:bg-amber-300 dark:text-stone-950 dark:hover:bg-amber-200"
                      onClick={handleCreate}
                      disabled={creating}
                    >
                      {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Create
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog
                open={creatingFolder}
                onOpenChange={(open) => {
                  setCreatingFolder(open);
                  if (!open) setNewFolderName('');
                }}
              >
                <DialogContent className="gap-0 overflow-hidden border-stone-200 bg-stone-50 p-0 sm:max-w-md dark:border-white/[0.09] dark:bg-[#211e1b]">
                  <DialogHeader className="border-b border-stone-200 bg-stone-100/80 px-6 pb-5 pt-6 text-left dark:border-white/[0.08] dark:bg-white/[0.025]">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-900 text-amber-200 shadow-sm shadow-stone-950/15 dark:bg-amber-300 dark:text-stone-950">
                        <FolderPlus className="h-5 w-5" strokeWidth={2.25} />
                      </span>
                      <div>
                        <DialogTitle className="text-xl font-semibold tracking-[-0.04em] text-stone-950 dark:text-stone-50">
                          New folder
                        </DialogTitle>
                        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                          Keep your projects organized.
                        </p>
                      </div>
                    </div>
                  </DialogHeader>
                  <div className="px-6 py-5">
                    <label className="grid gap-2 text-sm font-medium text-stone-700 dark:text-stone-200">
                      Folder name
                      <Input
                        placeholder="Untitled folder"
                        value={newFolderName}
                        onChange={(event) => setNewFolderName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void handleCreateFolder();
                          if (event.key === 'Escape') {
                            setCreatingFolder(false);
                            setNewFolderName('');
                          }
                        }}
                        className="border-stone-300 bg-white dark:border-white/[0.1] dark:bg-stone-950/30"
                        autoFocus
                      />
                    </label>
                  </div>
                  <DialogFooter className="border-t border-stone-200 bg-stone-100/50 px-6 py-4 dark:border-white/[0.08] dark:bg-white/[0.02]">
                    <Button
                      variant="outline"
                      className="border-stone-300 dark:border-white/[0.1]"
                      onClick={() => {
                        setCreatingFolder(false);
                        setNewFolderName('');
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="bg-stone-900 text-amber-100 hover:bg-stone-800 dark:bg-amber-300 dark:text-stone-950 dark:hover:bg-amber-200"
                      onClick={() => void handleCreateFolder()}
                      disabled={!newFolderName.trim()}
                    >
                      Create folder
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Search and Filter Bar */}
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
                <div className="relative w-full sm:max-w-md sm:flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                  <Input
                    placeholder="Search projects..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="border-stone-200 bg-stone-100/80 pl-9 focus:border-amber-500 dark:border-white/[0.08] dark:bg-stone-900/70 dark:focus:border-amber-300"
                  />
                </div>

                <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-stone-200 bg-stone-100/80 p-1 dark:border-white/[0.08] dark:bg-stone-900/70">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleSort('updated')}
                    className={`h-8 px-3 ${sortBy === 'updated' ? 'bg-amber-200/70 text-stone-950 dark:bg-amber-300/15 dark:text-amber-100' : ''}`}
                  >
                    <Clock className="w-3.5 h-3.5 mr-1.5" />
                    Updated
                    {sortBy === 'updated' &&
                      (sortDirection === 'desc' ? (
                        <SortDesc className="w-3 h-3 ml-1" />
                      ) : (
                        <SortAsc className="w-3 h-3 ml-1" />
                      ))}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleSort('created')}
                    className={`h-8 px-3 ${sortBy === 'created' ? 'bg-amber-200/70 text-stone-950 dark:bg-amber-300/15 dark:text-amber-100' : ''}`}
                  >
                    <Calendar className="w-3.5 h-3.5 mr-1.5" />
                    Created
                    {sortBy === 'created' &&
                      (sortDirection === 'desc' ? (
                        <SortDesc className="w-3 h-3 ml-1" />
                      ) : (
                        <SortAsc className="w-3 h-3 ml-1" />
                      ))}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleSort('name')}
                    className={`h-8 px-3 ${sortBy === 'name' ? 'bg-amber-200/70 text-stone-950 dark:bg-amber-300/15 dark:text-amber-100' : ''}`}
                  >
                    <Type className="w-3.5 h-3.5 mr-1.5" />
                    Name
                    {sortBy === 'name' &&
                      (sortDirection === 'desc' ? (
                        <SortDesc className="w-3 h-3 ml-1" />
                      ) : (
                        <SortAsc className="w-3 h-3 ml-1" />
                      ))}
                  </Button>
                </div>

                <div className="hidden items-center gap-1 rounded-xl border border-stone-200 bg-stone-100/80 p-1 dark:border-white/[0.08] dark:bg-stone-900/70 sm:flex">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Grid view"
                    onClick={() => setViewMode('grid')}
                    className={`h-8 w-8 ${viewMode === 'grid' ? 'bg-amber-200/70 text-stone-950 dark:bg-amber-300/15 dark:text-amber-100' : ''}`}
                  >
                    <Grid3X3 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="List view"
                    onClick={() => setViewMode('list')}
                    className={`h-8 w-8 ${viewMode === 'list' ? 'bg-amber-200/70 text-stone-950 dark:bg-amber-300/15 dark:text-amber-100' : ''}`}
                  >
                    <List className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto bg-[#f7f5f0] px-4 pb-4 pt-3 transition-colors duration-200 dark:bg-[#171513] sm:p-7">
              {loading ? (
                <div className="flex-1 flex items-center justify-center h-64">
                  <Loader2 className="w-8 h-8 animate-spin text-slate-400 dark:text-slate-500" />
                </div>
              ) : filteredProjects.length === 0 ? (
                searchQuery ? (
                  <div className="flex flex-col items-center justify-center h-64 text-center">
                    <Search className="w-12 h-12 text-slate-400 dark:text-slate-600 mb-4" />
                    <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">
                      No matching projects
                    </h3>
                    <p className="text-slate-500">Try a different search term</p>
                  </div>
                ) : (
                  <div className="flex h-64 flex-col items-center justify-center rounded-3xl border border-dashed border-stone-300 bg-stone-50/70 p-12 dark:border-white/[0.12] dark:bg-stone-900/35">
                    <Sparkles className="mb-4 h-12 w-12 text-amber-500 dark:text-amber-300" />
                    <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">
                      {isGuest ? 'Start Drawing Locally' : 'Start Creating'}
                    </h3>
                    <p className="text-slate-900 dark:text-slate-100 mb-6 text-center max-w-sm">
                      {isGuest
                        ? 'Create a local drawing project. Sign in to sync and collaborate.'
                        : 'Create your first drawing or import an existing project.'}
                    </p>
                    <div className="flex gap-3">
                      <Button
                        onClick={isGuest ? handleCreateGuestProject : openNewProjectDialog}
                        disabled={creating}
                        className="bg-stone-900 text-stone-50 hover:bg-stone-700 dark:bg-amber-300 dark:text-stone-950 dark:hover:bg-amber-200"
                      >
                        {creating ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <Plus className="w-4 h-4 mr-2" />
                            {isGuest ? 'Start Drawing' : 'New Project'}
                          </>
                        )}
                      </Button>
                      {!isGuest && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              className="border-slate-300 dark:border-white/20"
                            >
                              <Upload className="w-4 h-4 mr-2" />
                              Import
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={handleImportDRA}>
                              <FileArchive className="w-4 h-4 mr-2" />
                              Import .dra file
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={handleImportPDF}>
                              <FileText className="w-4 h-4 mr-2" />
                              Import PDF
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                )
              ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
                  {filteredProjects.map((project) => (
                    <div
                      key={project.id}
                      onClick={(e) => handleCardClick(project.id, e)}
                      className="surface-raised group relative flex cursor-pointer flex-col gap-3 rounded-2xl border-l-2 border-l-amber-300 bg-stone-50 p-4 transition-[background-color,border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:bg-white dark:bg-stone-900/65 dark:hover:bg-stone-900"
                    >
                      {/* Thumbnail */}
                      <div className="mb-2 flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-stone-200 bg-stone-100 dark:border-white/[0.07] dark:bg-stone-950/60">
                        {project.thumbnail ? (
                          <img
                            src={project.thumbnail}
                            alt={project.title}
                            className="h-full w-full object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
                          />
                        ) : (
                          <FileEdit className="h-8 w-8 text-stone-400 transition-colors group-hover:text-amber-600 dark:text-stone-600 dark:group-hover:text-amber-300" />
                        )}
                      </div>

                      <div className="flex items-start justify-between">
                        {renamingId === project.id ? (
                          <Input
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => handleRename(project.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRename(project.id);
                              if (e.key === 'Escape') setRenamingId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="h-7 border-amber-500 bg-stone-100 text-sm dark:border-amber-300 dark:bg-stone-950"
                            autoFocus
                          />
                        ) : (
                          <div className="truncate pr-8 font-semibold text-stone-900 transition-colors group-hover:text-amber-700 dark:text-stone-100 dark:group-hover:text-amber-200">
                            {project.title || 'Untitled'}
                          </div>
                        )}

                        {isMobile ? (
                          <Drawer>
                            <DrawerTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-3 right-3 opacity-100 h-8 w-8 bg-white/50 dark:bg-black/50 backdrop-blur-sm rounded-full"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => event.stopPropagation()}
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DrawerTrigger>
                            <DrawerContent
                              onPointerDown={(event) => event.stopPropagation()}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <DrawerHeader>
                                <DrawerTitle>{project.title || 'Untitled'} Actions</DrawerTitle>
                              </DrawerHeader>
                              <div className="p-4 space-y-2 max-h-[70vh] overflow-y-auto">
                                <DrawerClose asChild>
                                  <Button
                                    variant="outline"
                                    className="w-full justify-start"
                                    onClick={() => {
                                      setMobileRenameValue(project.title || '');
                                      setMobileRenameProject(project);
                                    }}
                                  >
                                    <Pencil className="w-4 h-4 mr-2" />
                                    Rename
                                  </Button>
                                </DrawerClose>

                                {!isGuest && (project.role === 'owner' || !project.role) && (
                                  <Button
                                    variant="outline"
                                    className="w-full justify-start"
                                    onClick={() => setSharingProject(project)}
                                  >
                                    <Share2 className="w-4 h-4 mr-2" />
                                    Share
                                  </Button>
                                )}

                                <Button
                                  variant="outline"
                                  className="w-full justify-start"
                                  onClick={() => {
                                    getToken()
                                      .then((token) => {
                                        getProject(project.id, token).then((record) => {
                                          createProject(
                                            `${project.title} (Copy)`,
                                            record.data,
                                            token,
                                          ).then(() => {
                                            loadData();
                                            toast({ title: 'Project duplicated' });
                                          });
                                        });
                                      })
                                      .catch(() =>
                                        toast({
                                          title: 'Failed to duplicate',
                                          variant: 'destructive',
                                        }),
                                      );
                                  }}
                                >
                                  <Copy className="w-4 h-4 mr-2" />
                                  Duplicate
                                </Button>

                                <div className="text-sm font-medium text-muted-foreground mt-4 mb-2">
                                  Export
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() =>
                                      handleExportDRA(project.id, project.title || 'project')
                                    }
                                  >
                                    <FileArchive className="w-4 h-4 mr-2" />
                                    .dra
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() =>
                                      handleExportPNG(project.id, project.title || 'drawing')
                                    }
                                  >
                                    <Image className="w-4 h-4 mr-2" />
                                    PNG
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() =>
                                      handleExportPDF(project.id, project.title || 'drawing')
                                    }
                                  >
                                    <FileText className="w-4 h-4 mr-2" />
                                    PDF
                                  </Button>
                                </div>

                                {(project.role === 'owner' || !project.role) && (
                                  <>
                                    <div className="h-px bg-border my-2" />
                                    <Button
                                      variant="destructive"
                                      className="w-full justify-start"
                                      onClick={() => void handleDeleteProject(project)}
                                    >
                                      <Trash2 className="w-4 h-4 mr-2" />
                                      Delete
                                    </Button>
                                  </>
                                )}
                              </div>
                              <DrawerFooter>
                                <DrawerClose asChild>
                                  <Button variant="outline">Close</Button>
                                </DrawerClose>
                              </DrawerFooter>
                            </DrawerContent>
                          </Drawer>
                        ) : (
                          <DropdownMenu
                            modal={true}
                            onOpenChange={(open) => handleMenuOpenChange(open, project.id)}
                          >
                            <DropdownMenuTrigger
                              asChild
                              onClick={(e: React.MouseEvent) => e.stopPropagation()}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Actions for ${project.title || 'Untitled'}`}
                                className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 h-8 w-8 transition-opacity"
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="w-48"
                              onCloseAutoFocus={(e) => e.preventDefault()}
                              onPointerDownOutside={() => {
                                menuClosedAtRef.current = Date.now();
                              }}
                              onInteractOutside={() => {
                                menuClosedAtRef.current = Date.now();
                              }}
                            >
                              <DropdownMenuItem
                                onSelect={() => {
                                  setRenameValue(project.title || '');
                                  setRenamingId(project.id);
                                }}
                              >
                                <Pencil className="w-4 h-4 mr-2" />
                                Rename
                              </DropdownMenuItem>
                              {!isGuest && (project.role === 'owner' || !project.role) && (
                                <DropdownMenuItem onSelect={() => setSharingProject(project)}>
                                  <Share2 className="w-4 h-4 mr-2" />
                                  Share
                                </DropdownMenuItem>
                              )}
                              {showFolderNavigation && !isGuest && (
                                <DropdownMenuSub>
                                  <DropdownMenuSubTrigger>
                                    <FolderInput className="w-4 h-4 mr-2" />
                                    Move to folder
                                  </DropdownMenuSubTrigger>
                                  <DropdownMenuSubContent>
                                    <DropdownMenuItem
                                      onSelect={() => handleMoveToFolder(project.id, null)}
                                    >
                                      <Home className="w-4 h-4 mr-2" />
                                      All Projects
                                    </DropdownMenuItem>
                                    {folders.length > 0 && <DropdownMenuSeparator />}
                                    {folders.map((f) => (
                                      <DropdownMenuItem
                                        key={f.id}
                                        onSelect={() => handleMoveToFolder(project.id, f.id)}
                                      >
                                        <Folder
                                          className="w-4 h-4 mr-2"
                                          style={{ color: f.color }}
                                        />
                                        {f.name}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuSubContent>
                                </DropdownMenuSub>
                              )}
                              <DropdownMenuItem
                                onSelect={() => {
                                  getToken()
                                    .then((token) => {
                                      getProject(project.id, token).then((record) => {
                                        createProject(
                                          `${project.title} (Copy)`,
                                          record.data,
                                          token,
                                        ).then(() => {
                                          loadData();
                                          toast({ title: 'Project duplicated' });
                                        });
                                      });
                                    })
                                    .catch(() =>
                                      toast({
                                        title: 'Failed to duplicate',
                                        variant: 'destructive',
                                      }),
                                    );
                                }}
                              >
                                <Copy className="w-4 h-4 mr-2" />
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                  <Download className="w-4 h-4 mr-2" />
                                  Export
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      handleExportDRA(project.id, project.title || 'project')
                                    }
                                  >
                                    <FileArchive className="w-4 h-4 mr-2" />
                                    Export as .dra
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      handleExportPNG(project.id, project.title || 'drawing')
                                    }
                                  >
                                    <Image className="w-4 h-4 mr-2" />
                                    Export as PNG
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      handleExportPDF(project.id, project.title || 'drawing')
                                    }
                                  >
                                    <FileText className="w-4 h-4 mr-2" />
                                    Export as PDF
                                  </DropdownMenuItem>
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                              {(project.role === 'owner' || !project.role) && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onSelect={() => void handleDeleteProject(project)}
                                    className="text-red-500 dark:text-red-400 focus:text-red-500 dark:focus:text-red-400"
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>

                      <div className="mt-auto flex items-center justify-between text-xs text-slate-500">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(project.updatedAt, { addSuffix: true })}
                        </div>
                        <div className="flex items-center gap-2">
                          {project.role && project.role !== 'owner' && (
                            <span className="flex items-center gap-1 rounded-full border border-amber-300/70 bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-200">
                              <Users className="w-3 h-3" />
                              {project.role}
                            </span>
                          )}
                          {project.shared && (
                            <span className="bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold border border-emerald-200 dark:border-emerald-500/20">
                              Shared
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* List View */
                <div className="space-y-2">
                  {filteredProjects.map((project) => (
                    <div
                      key={project.id}
                      onClick={(e) => handleCardClick(project.id, e)}
                      className="surface-raised group relative flex cursor-pointer items-center gap-4 rounded-xl bg-stone-50 p-3 transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:bg-white dark:bg-stone-900/60 dark:hover:bg-stone-900"
                    >
                      <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-stone-100 dark:border-white/[0.07] dark:bg-stone-950/60">
                        <FileEdit className="w-5 h-5 text-slate-400 dark:text-slate-700" />
                      </div>

                      <div className="flex-1 min-w-0">
                        {renamingId === project.id ? (
                          <Input
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => handleRename(project.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRename(project.id);
                              if (e.key === 'Escape') setRenamingId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="h-7 max-w-xs border-amber-500 bg-stone-100 text-sm dark:border-amber-300 dark:bg-stone-950"
                            autoFocus
                          />
                        ) : (
                          <div className="truncate font-medium text-stone-900 transition-colors group-hover:text-amber-700 dark:text-stone-100 dark:group-hover:text-amber-200">
                            {project.title || 'Untitled'}
                          </div>
                        )}
                        <div className="text-xs text-slate-500 flex items-center gap-3 mt-0.5">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Updated {formatDistanceToNow(project.updatedAt, { addSuffix: true })}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Created {format(project.createdAt || Date.now(), 'MMM d, yyyy')}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {project.role && project.role !== 'owner' && (
                          <span className="flex items-center gap-1 rounded-full border border-amber-300/70 bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:border-amber-300/20 dark:bg-amber-300/10 dark:text-amber-200">
                            <Users className="w-3 h-3" />
                            {project.role}
                          </span>
                        )}
                        {project.shared && (
                          <span className="bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold border border-emerald-200 dark:border-emerald-500/20">
                            Shared
                          </span>
                        )}

                        {isMobile ? (
                          <Drawer>
                            <DrawerTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => event.stopPropagation()}
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DrawerTrigger>
                            <DrawerContent
                              onPointerDown={(event) => event.stopPropagation()}
                              onClick={(event) => event.stopPropagation()}
                            >
                              <DrawerHeader>
                                <DrawerTitle>{project.title || 'Untitled'} Actions</DrawerTitle>
                              </DrawerHeader>
                              <div className="p-4 space-y-2 max-h-[70vh] overflow-y-auto">
                                <DrawerClose asChild>
                                  <Button
                                    variant="outline"
                                    className="w-full justify-start"
                                    onClick={() => {
                                      setMobileRenameValue(project.title || '');
                                      setMobileRenameProject(project);
                                    }}
                                  >
                                    <Pencil className="w-4 h-4 mr-2" />
                                    Rename
                                  </Button>
                                </DrawerClose>

                                {!isGuest && (project.role === 'owner' || !project.role) && (
                                  <Button
                                    variant="outline"
                                    className="w-full justify-start"
                                    onClick={() => setSharingProject(project)}
                                  >
                                    <Share2 className="w-4 h-4 mr-2" />
                                    Share
                                  </Button>
                                )}

                                <Button
                                  variant="outline"
                                  className="w-full justify-start"
                                  onClick={() => {
                                    getToken()
                                      .then((token) => {
                                        getProject(project.id, token).then((record) => {
                                          createProject(
                                            `${project.title} (Copy)`,
                                            record.data,
                                            token,
                                          ).then(() => {
                                            loadData();
                                            toast({ title: 'Project duplicated' });
                                          });
                                        });
                                      })
                                      .catch(() =>
                                        toast({
                                          title: 'Failed to duplicate',
                                          variant: 'destructive',
                                        }),
                                      );
                                  }}
                                >
                                  <Copy className="w-4 h-4 mr-2" />
                                  Duplicate
                                </Button>

                                <div className="text-sm font-medium text-muted-foreground mt-4 mb-2">
                                  Export
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() =>
                                      handleExportDRA(project.id, project.title || 'project')
                                    }
                                  >
                                    <FileArchive className="w-4 h-4 mr-2" />
                                    .dra
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() =>
                                      handleExportPNG(project.id, project.title || 'drawing')
                                    }
                                  >
                                    <Image className="w-4 h-4 mr-2" />
                                    PNG
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() =>
                                      handleExportPDF(project.id, project.title || 'drawing')
                                    }
                                  >
                                    <FileText className="w-4 h-4 mr-2" />
                                    PDF
                                  </Button>
                                </div>

                                {(project.role === 'owner' || !project.role) && (
                                  <>
                                    <div className="h-px bg-border my-2" />
                                    <Button
                                      variant="destructive"
                                      className="w-full justify-start"
                                      onClick={() => void handleDeleteProject(project)}
                                    >
                                      <Trash2 className="w-4 h-4 mr-2" />
                                      Delete
                                    </Button>
                                  </>
                                )}
                              </div>
                              <DrawerFooter>
                                <DrawerClose asChild>
                                  <Button variant="outline">Close</Button>
                                </DrawerClose>
                              </DrawerFooter>
                            </DrawerContent>
                          </Drawer>
                        ) : (
                          <DropdownMenu
                            modal={true}
                            onOpenChange={(open) => handleMenuOpenChange(open, project.id)}
                          >
                            <DropdownMenuTrigger
                              asChild
                              onClick={(e: React.MouseEvent) => e.stopPropagation()}
                            >
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              className="w-48"
                              onCloseAutoFocus={(e) => e.preventDefault()}
                              onPointerDownOutside={() => {
                                menuClosedAtRef.current = Date.now();
                              }}
                              onInteractOutside={() => {
                                menuClosedAtRef.current = Date.now();
                              }}
                            >
                              <DropdownMenuItem
                                onSelect={() => {
                                  setRenameValue(project.title || '');
                                  setRenamingId(project.id);
                                }}
                              >
                                <Pencil className="w-4 h-4 mr-2" />
                                Rename
                              </DropdownMenuItem>
                              {!isGuest && (project.role === 'owner' || !project.role) && (
                                <DropdownMenuItem onSelect={() => setSharingProject(project)}>
                                  <Share2 className="w-4 h-4 mr-2" />
                                  Share
                                </DropdownMenuItem>
                              )}
                              {showFolderNavigation && !isGuest && (
                                <DropdownMenuSub>
                                  <DropdownMenuSubTrigger>
                                    <FolderInput className="w-4 h-4 mr-2" />
                                    Move to folder
                                  </DropdownMenuSubTrigger>
                                  <DropdownMenuSubContent>
                                    <DropdownMenuItem
                                      onSelect={() => handleMoveToFolder(project.id, null)}
                                    >
                                      <Home className="w-4 h-4 mr-2" />
                                      All Projects
                                    </DropdownMenuItem>
                                    {folders.length > 0 && <DropdownMenuSeparator />}
                                    {folders.map((f) => (
                                      <DropdownMenuItem
                                        key={f.id}
                                        onSelect={() => handleMoveToFolder(project.id, f.id)}
                                      >
                                        <Folder
                                          className="w-4 h-4 mr-2"
                                          style={{ color: f.color }}
                                        />
                                        {f.name}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuSubContent>
                                </DropdownMenuSub>
                              )}
                              <DropdownMenuItem
                                onSelect={() => {
                                  getToken()
                                    .then((token) => {
                                      getProject(project.id, token).then((record) => {
                                        createProject(
                                          `${project.title} (Copy)`,
                                          record.data,
                                          token,
                                        ).then(() => {
                                          loadData();
                                          toast({ title: 'Project duplicated' });
                                        });
                                      });
                                    })
                                    .catch(() =>
                                      toast({
                                        title: 'Failed to duplicate',
                                        variant: 'destructive',
                                      }),
                                    );
                                }}
                              >
                                <Copy className="w-4 h-4 mr-2" />
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                  <Download className="w-4 h-4 mr-2" />
                                  Export
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      handleExportDRA(project.id, project.title || 'project')
                                    }
                                  >
                                    <FileArchive className="w-4 h-4 mr-2" />
                                    Export as .dra
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      handleExportPNG(project.id, project.title || 'drawing')
                                    }
                                  >
                                    <Image className="w-4 h-4 mr-2" />
                                    Export as PNG
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      handleExportPDF(project.id, project.title || 'drawing')
                                    }
                                  >
                                    <FileText className="w-4 h-4 mr-2" />
                                    Export as PDF
                                  </DropdownMenuItem>
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                              {(project.role === 'owner' || !project.role) && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onSelect={() => void handleDeleteProject(project)}
                                    className="text-red-500 dark:text-red-400 focus:text-red-500 dark:focus:text-red-400"
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={!!mobileRenameProject}
        onOpenChange={(open) => {
          if (!open && !isRenamingMobileProject) setMobileRenameProject(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-3">
            <label
              className="text-sm font-medium text-stone-700 dark:text-stone-200"
              htmlFor="mobile-project-name"
            >
              Project name
            </label>
            <Input
              id="mobile-project-name"
              value={mobileRenameValue}
              onChange={(event) => setMobileRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleMobileRename();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMobileRenameProject(null)}
              disabled={isRenamingMobileProject}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleMobileRename()}
              disabled={!mobileRenameValue.trim() || isRenamingMobileProject}
            >
              {isRenamingMobileProject && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save name
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Controlled Share Dialog */}
      {sharingProject && (
        <ProjectShareDialog
          project={sharingProject}
          open={!!sharingProject}
          onOpenChange={(open) => !open && setSharingProject(null)}
          onUpdate={loadData}
        />
      )}
    </>
  );
}
