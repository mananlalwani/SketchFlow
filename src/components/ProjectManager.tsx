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
  moveProjectToFolder
} from '@/lib/api';
import { useDrawingStore } from '@/store/drawingStore';
import { deserializeProject, serializeProject, generateId } from '@/lib/utils';
import { encodeDrawFormat, decodeDrawFormat, DRAW_FORMAT_EXTENSION } from '@/lib/drawFormat';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Configure PDF.js worker using Vite's asset import
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
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
  Info
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

type SortOption = 'updated' | 'created' | 'name';
type SortDirection = 'asc' | 'desc';
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
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
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
  
  // Track when menu was last closed to ignore clicks right after
  const menuClosedAtRef = useRef<number>(0);
  
  const handleCardClick = (projectId: string, e: React.MouseEvent) => {
    // Check if click originated from within a dropdown menu (rendered in portal)
    const target = e.target as HTMLElement;
    if (target.closest('[role="menu"]') || target.closest('[data-radix-popper-content-wrapper]')) {
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
  
  const { 
    setObjects, 
    replaceHistory, 
    requestFullRedraw, 
    setProjectTitle, 
    setCurrentProject, 
    markSaved,
    currentProjectId,
    setProjectRole
  } = useDrawingStore();

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
        setProjects(projectList.filter(p => p && p.id).map(p => ({
          ...p,
          shared: p.shared ?? false,
          role: p.role ?? 'owner'
        })));
        setFolders([]);
      } else if (userId) {
        // For authenticated users, load from server
        const token = await getToken();
        const [projectList, folderList] = await Promise.all([
          listProjects(token),
          listFolders(token).catch(() => [] as FolderRecord[])
        ]);
        setProjects(projectList.filter(p => p && p.id).map(p => ({
          ...p,
          shared: p.shared ?? false,
          role: p.role ?? 'owner'
        })));
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

  const filteredProjects = useMemo(() => {
    let result = [...projects];
    
    if (selectedFolderId === null) {
      if (!searchQuery.trim()) {
        result = result.filter(p => !p.folderId);
      }
    } else {
      result = result.filter(p => p.folderId === selectedFolderId);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = projects.filter(p => 
        p.title?.toLowerCase().includes(query)
      );
    }
    
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'name':
          comparison = (a.title || '').localeCompare(b.title || '');
          break;
        case 'created':
          comparison = (a.createdAt || 0) - (b.createdAt || 0);
          break;
        case 'updated':
        default:
          comparison = (a.updatedAt || 0) - (b.updatedAt || 0);
      }
      return sortDirection === 'desc' ? -comparison : comparison;
    });
    
    return result;
  }, [projects, searchQuery, sortBy, sortDirection, selectedFolderId]);

  const currentFolderName = useMemo(() => {
    if (selectedFolderId === null) return 'All Projects';
    const folder = folders.find(f => f.id === selectedFolderId);
    return folder?.name || 'Unknown Folder';
  }, [selectedFolderId, folders]);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const token = await getToken();
      await createFolder(newFolderName.trim(), '#3b82f6', null, token);
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
      const oldFolderId = projects.find(p => p.id === projectId)?.folderId;
      
      // Update projects state
      setProjects(prev => prev.map(p => 
        p.id === projectId ? { ...p, folderId } : p
      ));
      
      // Update folder counts
      setFolders(prev => prev.map(f => {
        if (f.id === oldFolderId) {
          // Decrement old folder count
          return { ...f, projectCount: Math.max(0, (f.projectCount || 1) - 1) };
        }
        if (f.id === folderId) {
          // Increment new folder count
          return { ...f, projectCount: (f.projectCount || 0) + 1 };
        }
        return f;
      }));
      
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
      
      // If a folder is selected, move the project to that folder
      if (selectedFolderId) {
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
      const record = await getProject<ReturnType<typeof serializeProject>>(id, token);
      const objects = deserializeProject(record.data);
      
      setObjects(objects);
      replaceHistory(objects);
      requestFullRedraw();
      setProjectTitle(record.title);
      setCurrentProject(record.id);
      markSaved();
      
      // Set project role - guests always get 'owner' role for local projects
      const role = isGuest ? 'owner' : (record.role || 'owner');
      setProjectRole(role);
      
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
      const record = await getProject<ReturnType<typeof serializeProject>>(id, token);
      await updateProject(id, renameValue.trim(), record.data, token);
      setProjects(prev => prev.map(p => 
        p.id === id ? { ...p, title: renameValue.trim() } : p
      ));
      setRenamingId(null);
      toast({ title: 'Project renamed' });
    } catch {
      toast({ title: 'Failed to rename', variant: 'destructive' });
    }
  };

  const handleExportPNG = async (projectId: string, title: string) => {
    try {
      const token = await getToken();
      const record = await getProject<ReturnType<typeof serializeProject>>(projectId, token);
      const objects = deserializeProject(record.data);
      
      const canvas = document.createElement('canvas');
      canvas.width = 4096;
      canvas.height = 4096;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');
      
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      for (const obj of objects) {
        ctx.save();
        ctx.globalAlpha = obj.alpha ?? 1;
        ctx.strokeStyle = obj.color;
        ctx.fillStyle = obj.color;
        ctx.lineWidth = obj.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        if (obj.type === 'stroke' && obj.points && obj.points.length > 0) {
          ctx.beginPath();
          ctx.moveTo(obj.points[0].x, obj.points[0].y);
          for (let i = 1; i < obj.points.length; i++) {
            ctx.lineTo(obj.points[i].x, obj.points[i].y);
          }
          ctx.stroke();
        } else if (obj.type === 'line') {
          ctx.beginPath();
          ctx.moveTo(obj.x, obj.y);
          ctx.lineTo(obj.x + obj.width, obj.y + obj.height);
          ctx.stroke();
        } else if (obj.type === 'rectangle') {
          if (obj.filled) {
            ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
          } else {
            ctx.strokeRect(obj.x, obj.y, obj.width, obj.height);
          }
        } else if (obj.type === 'ellipse') {
          ctx.beginPath();
          ctx.ellipse(obj.x + obj.width/2, obj.y + obj.height/2, Math.abs(obj.width/2), Math.abs(obj.height/2), 0, 0, Math.PI * 2);
          if (obj.filled) {
            ctx.fill();
          } else {
            ctx.stroke();
          }
        } else if (obj.type === 'text' && obj.text) {
          ctx.font = `${obj.fontSize || 24}px sans-serif`;
          ctx.fillText(obj.text, obj.x, obj.y);
        }
        ctx.restore();
      }
      
      const link = document.createElement('a');
      link.download = `${title || 'drawing'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      
      toast({ title: 'Exported as PNG' });
    } catch (e) {
      console.error(e);
      toast({ title: 'Export failed', variant: 'destructive' });
    }
  };

  const handleExportPDF = async (projectId: string, title: string) => {
    try {
      const token = await getToken();
      const record = await getProject<ReturnType<typeof serializeProject>>(projectId, token);
      const objects = deserializeProject(record.data);
      
      const canvas = document.createElement('canvas');
      canvas.width = 4096;
      canvas.height = 4096;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');
      
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      for (const obj of objects) {
        ctx.save();
        ctx.globalAlpha = obj.alpha ?? 1;
        ctx.strokeStyle = obj.color;
        ctx.fillStyle = obj.color;
        ctx.lineWidth = obj.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        if (obj.type === 'stroke' && obj.points && obj.points.length > 0) {
          ctx.beginPath();
          ctx.moveTo(obj.points[0].x, obj.points[0].y);
          for (let i = 1; i < obj.points.length; i++) {
            ctx.lineTo(obj.points[i].x, obj.points[i].y);
          }
          ctx.stroke();
        } else if (obj.type === 'line') {
          ctx.beginPath();
          ctx.moveTo(obj.x, obj.y);
          ctx.lineTo(obj.x + obj.width, obj.y + obj.height);
          ctx.stroke();
        } else if (obj.type === 'rectangle') {
          if (obj.filled) {
            ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
          } else {
            ctx.strokeRect(obj.x, obj.y, obj.width, obj.height);
          }
        } else if (obj.type === 'ellipse') {
          ctx.beginPath();
          ctx.ellipse(obj.x + obj.width/2, obj.y + obj.height/2, Math.abs(obj.width/2), Math.abs(obj.height/2), 0, 0, Math.PI * 2);
          if (obj.filled) {
            ctx.fill();
          } else {
            ctx.stroke();
          }
        } else if (obj.type === 'text' && obj.text) {
          ctx.font = `${obj.fontSize || 24}px sans-serif`;
          ctx.fillText(obj.text, obj.x, obj.y);
        }
        ctx.restore();
      }
      
      const imgData = canvas.toDataURL('image/png');
      
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>${title || 'Drawing'}</title>
            <style>
              body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #1e293b; }
              img { max-width: 100%; max-height: 100vh; }
              @media print {
                body { background: white; }
                img { max-width: 100%; height: auto; }
              }
            </style>
          </head>
          <body>
            <img src="${imgData}" />
            <script>
              window.onload = function() {
                window.print();
              }
            </script>
          </body>
          </html>
        `);
        printWindow.document.close();
      }
      
      toast({ title: 'Opening print dialog for PDF' });
    } catch (e) {
      console.error(e);
      toast({ title: 'Export failed', variant: 'destructive' });
    }
  };

  const handleExportDRA = async (projectId: string, title: string) => {
    try {
      const token = await getToken();
      const record = await getProject<ReturnType<typeof serializeProject>>(projectId, token);
      
      const encrypted = await encodeDrawFormat(record.data);
      
      const blob = new Blob([encrypted], { type: 'application/x-drawapp' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title || 'project'}${DRAW_FORMAT_EXTENSION}`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast({ title: 'Exported as .dra file' });
    } catch (e) {
      console.error(e);
      toast({ title: 'Export failed', variant: 'destructive' });
    }
  };

  const handleImportDRA = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = DRAW_FORMAT_EXTENSION;
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        const buffer = await file.arrayBuffer();
        const data = await decodeDrawFormat(buffer);
        
        const token = await getToken();
        const title = file.name.replace(new RegExp(`\\${DRAW_FORMAT_EXTENSION}$`), '') || 'Imported Project';
        await createProject(title, data, token);
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
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        toast({ title: 'Processing PDF...', description: 'This may take a moment.' });
        
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        
        const objects: ReturnType<typeof deserializeProject> = [];
        const CANVAS_SIZE = 4096;
        let yOffset = 100; // Start with some margin
        
        // Calculate all page positions first
        const pageData: Array<{ imageData: string; x: number; y: number; width: number; height: number }> = [];
        
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 2 }); // Higher scale for better quality
          
          // Create a canvas to render the page
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          
          await page.render({ canvasContext: ctx, viewport }).promise;
          
          // Convert to data URL
          const imageData = canvas.toDataURL('image/png');
          
          // Scale to fit within canvas width with margin
          const maxWidth = CANVAS_SIZE - 200;
          const scale = Math.min(1, maxWidth / viewport.width);
          const scaledWidth = viewport.width * scale;
          const scaledHeight = viewport.height * scale;
          
          pageData.push({
            imageData,
            x: (CANVAS_SIZE - scaledWidth) / 2, // Center horizontally
            y: yOffset,
            width: scaledWidth,
            height: scaledHeight
          });
          
          yOffset += scaledHeight + 50; // Add spacing between pages
        }
        
        if (pageData.length === 0) {
          toast({ title: 'Import failed', description: 'No pages found in PDF', variant: 'destructive' });
          return;
        }
        
        // Add pages in reverse order using unshift so they render in the background
        // (first in array = drawn first = behind, but we want page 1 visually on top)
        for (let i = pageData.length - 1; i >= 0; i--) {
          const page = pageData[i];
          objects.unshift({
            id: generateId(),
            type: 'image',
            x: page.x,
            y: page.y,
            width: page.width,
            height: page.height,
            color: '#000000',
            size: 1,
            alpha: 1,
            imageData: page.imageData
          });
        }
        
        const projectData = serializeProject(objects, CANVAS_SIZE, CANVAS_SIZE);
        const token = await getToken();
        const title = file.name.replace(/\.pdf$/i, '') || 'Imported PDF';
        await createProject(title, projectData, token);
        await loadData();
        toast({ title: 'PDF imported successfully', description: `${pdf.numPages} page(s) imported.` });
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
      setSortDirection(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(option);
      setSortDirection('desc');
    }
  };

  if (!isLoaded) return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-slate-400" /></div>;

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
    <div className="flex h-full w-full animate-fade-in bg-slate-50 dark:bg-slate-950 transition-colors duration-200 flex-col">
      {/* Guest Mode Banner - Dismissable */}
      {isGuest && !guestBannerDismissed && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-b border-blue-200 dark:border-blue-800/50 px-6 py-3">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                <Info className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                  You're in Guest Mode
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Projects are saved locally. Sign in to sync and collaborate.
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismissBanner}
              className="h-8 w-8 p-0 hover:bg-blue-200 dark:hover:bg-blue-900/50"
            >
              <X className="w-4 h-4 text-blue-700 dark:text-blue-300" />
            </Button>
          </div>
        </div>
      )}
      
      <div className="flex flex-1 overflow-hidden">
      {/* Folder Sidebar */}
      <div className="w-56 border-r border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-slate-900/30 flex flex-col shrink-0 transition-colors duration-200">
        <div className="p-3 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{isGuest ? 'Local Projects' : 'Folders'}</span>
            {!isGuest && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-slate-500 hover:text-slate-900 dark:hover:text-white"
                onClick={() => setCreatingFolder(true)}
                title="New Folder"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
          {creatingFolder && (
            <div className="flex gap-1">
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name"
                className="h-7 text-xs"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder();
                  if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName(''); }
                }}
              />
              <Button size="sm" className="h-7 px-2" onClick={handleCreateFolder}>
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <button
            onClick={() => setSelectedFolderId(null)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
              selectedFolderId === null && !searchQuery
                ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Home className="w-4 h-4" />
            <span className="truncate flex-1">Unsorted</span>
            <span className="text-xs opacity-60">
              {projects.filter(p => !p.folderId).length}
            </span>
            {/* Spacer to align with folder dropdown buttons */}
            <div className="w-6 h-6" />
          </button>

          {folders.map(folder => (
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
                <button
                  onClick={() => setSelectedFolderId(folder.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                    selectedFolderId === folder.id
                      ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Folder className="w-4 h-4" style={{ color: folder.color }} />
                  <span className="truncate flex-1">{folder.name}</span>
                  <span className="text-xs opacity-60">{folder.projectCount || 0}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      >
                        <MoreHorizontal className="w-3 h-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onSelect={() => {
                        setFolderRenameValue(folder.name);
                        setRenamingFolderId(folder.id);
                      }}>
                        <Pencil className="w-4 h-4 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: folder.color }} />
                          Color
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {FOLDER_COLORS.map(c => (
                            <DropdownMenuItem
                              key={c.value}
                              onSelect={async () => {
                                const token = await getToken();
                                await updateFolder(folder.id, folder.name, c.value, folder.parentId, token);
                                await loadData();
                              }}
                            >
                              <div className="w-4 h-4 rounded-full mr-2" style={{ backgroundColor: c.value }} />
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
                </button>
              )}
            </div>
          ))}
        </div>
        
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/50 transition-colors duration-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2 text-slate-900 dark:text-slate-100">
                {selectedFolderId ? (
                  <Folder className="w-6 h-6" style={{ color: folders.find(f => f.id === selectedFolderId)?.color }} />
                ) : (
                  <FolderOpen className="w-6 h-6 text-blue-500 dark:text-blue-400" />
                )}
                {currentFolderName}
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                {filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''}
                {searchQuery && ` matching "${searchQuery}"`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="border-slate-300 dark:border-white/10">
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
              <Button onClick={openNewProjectDialog} disabled={creating} className="bg-blue-600 hover:bg-blue-500">
                {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                New Project
              </Button>
            </div>
          </div>

          {/* New Project Dialog */}
          <Dialog open={showNewProjectDialog} onOpenChange={setShowNewProjectDialog}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <Input
                  placeholder="Project name"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                    if (e.key === 'Escape') setShowNewProjectDialog(false);
                  }}
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowNewProjectDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={creating}>
                  {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Search and Filter Bar */}
          <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-slate-100 dark:bg-slate-800/50 border-slate-300 dark:border-white/10 focus:border-blue-500"
            />
          </div>
          
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/50 rounded-lg p-1 border border-slate-300 dark:border-white/10">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleSort('updated')}
              className={`h-8 px-3 ${sortBy === 'updated' ? 'bg-slate-200 dark:bg-white/10' : ''}`}
            >
              <Clock className="w-3.5 h-3.5 mr-1.5" />
              Updated
              {sortBy === 'updated' && (sortDirection === 'desc' ? <SortDesc className="w-3 h-3 ml-1" /> : <SortAsc className="w-3 h-3 ml-1" />)}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleSort('created')}
              className={`h-8 px-3 ${sortBy === 'created' ? 'bg-slate-200 dark:bg-white/10' : ''}`}
            >
              <Calendar className="w-3.5 h-3.5 mr-1.5" />
              Created
              {sortBy === 'created' && (sortDirection === 'desc' ? <SortDesc className="w-3 h-3 ml-1" /> : <SortAsc className="w-3 h-3 ml-1" />)}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleSort('name')}
              className={`h-8 px-3 ${sortBy === 'name' ? 'bg-slate-200 dark:bg-white/10' : ''}`}
            >
              <Type className="w-3.5 h-3.5 mr-1.5" />
              Name
              {sortBy === 'name' && (sortDirection === 'desc' ? <SortDesc className="w-3 h-3 ml-1" /> : <SortAsc className="w-3 h-3 ml-1" />)}
            </Button>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/50 rounded-lg p-1 border border-slate-300 dark:border-white/10">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setViewMode('grid')}
              className={`h-8 w-8 ${viewMode === 'grid' ? 'bg-slate-200 dark:bg-white/10' : ''}`}
            >
              <Grid3X3 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setViewMode('list')}
              className={`h-8 w-8 ${viewMode === 'list' ? 'bg-slate-200 dark:bg-white/10' : ''}`}
            >
              <List className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
        {loading ? (
          <div className="flex-1 flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400 dark:text-slate-500" />
          </div>
        ) : filteredProjects.length === 0 ? (
          searchQuery ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Search className="w-12 h-12 text-slate-400 dark:text-slate-600 mb-4" />
              <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300">No matching projects</h3>
              <p className="text-slate-500">Try a different search term</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-300 dark:border-white/10 rounded-2xl bg-white/50 dark:bg-white/5 p-12">
              <Sparkles className="w-12 h-12 text-blue-500 dark:text-blue-400 mb-4" />
              <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300">
                {isGuest ? 'Start Drawing Locally' : 'Start Creating'}
              </h3>
              <p className="text-slate-500 mb-6 text-center max-w-sm">
                {isGuest 
                  ? 'Create a local drawing project. Sign in to sync and collaborate.' 
                  : 'Create your first drawing or import an existing project.'}
              </p>
              <div className="flex gap-3">
                <Button 
                  onClick={isGuest ? handleCreateGuestProject : openNewProjectDialog} 
                  disabled={creating}
                  className="bg-blue-600 hover:bg-blue-500"
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
                    <Button variant="outline" className="border-slate-300 dark:border-white/20">
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProjects.map(project => (
              <div 
                key={project.id}
                onClick={(e) => handleCardClick(project.id, e)}
                className="group relative bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 hover:border-blue-400 dark:hover:border-blue-500/50 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl p-4 cursor-pointer transition-all duration-200 flex flex-col gap-3 shadow-sm hover:shadow-md"
              >
                {/* Thumbnail placeholder */}
                <div className="aspect-video bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-white/5 flex items-center justify-center mb-2 group-hover:border-blue-400/20 dark:group-hover:border-blue-500/20 transition-colors">
                  <FileEdit className="w-8 h-8 text-slate-400 dark:text-slate-700 group-hover:text-slate-500 dark:group-hover:text-slate-600 transition-colors" />
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
                      className="h-7 text-sm bg-slate-100 dark:bg-slate-900 border-blue-500"
                      autoFocus
                    />
                  ) : (
                    <div className="font-semibold truncate pr-8 text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {project.title || 'Untitled'}
                    </div>
                  )}
                  
                  <DropdownMenu 
                    modal={true}
                    onOpenChange={(open) => handleMenuOpenChange(open, project.id)}
                  >
                    <DropdownMenuTrigger asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 h-8 w-8 transition-opacity"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent 
                      align="end" 
                      className="w-48"
                      onCloseAutoFocus={(e) => e.preventDefault()}
                      onPointerDownOutside={() => { menuClosedAtRef.current = Date.now(); }}
                      onInteractOutside={() => { menuClosedAtRef.current = Date.now(); }}
                    >
                      <DropdownMenuItem onSelect={() => {
                        setRenameValue(project.title || '');
                        setRenamingId(project.id);
                      }}>
                        <Pencil className="w-4 h-4 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      {!isGuest && (project.role === 'owner' || !project.role) && (
                        <DropdownMenuItem onSelect={() => setSharingProject(project)}>
                          <Share2 className="w-4 h-4 mr-2" />
                          Share
                        </DropdownMenuItem>
                      )}
                      {!isGuest && (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <FolderInput className="w-4 h-4 mr-2" />
                            Move to folder
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                          <DropdownMenuItem onSelect={() => handleMoveToFolder(project.id, null)}>
                            <Home className="w-4 h-4 mr-2" />
                            All Projects
                          </DropdownMenuItem>
                          {folders.length > 0 && <DropdownMenuSeparator />}
                          {folders.map(f => (
                            <DropdownMenuItem
                              key={f.id}
                              onSelect={() => handleMoveToFolder(project.id, f.id)}
                            >
                              <Folder className="w-4 h-4 mr-2" style={{ color: f.color }} />
                              {f.name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      )}
                      <DropdownMenuItem onSelect={() => {
                        getToken().then(token => {
                          getProject<ReturnType<typeof serializeProject>>(project.id, token).then(record => {
                            createProject(`${project.title} (Copy)`, record.data, token).then(() => {
                              loadData();
                              toast({ title: 'Project duplicated' });
                            });
                          });
                        }).catch(() => toast({ title: 'Failed to duplicate', variant: 'destructive' }));
                      }}>
                        <Copy className="w-4 h-4 mr-2" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <Download className="w-4 h-4 mr-2" />
                          Export
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          <DropdownMenuItem onSelect={() => handleExportDRA(project.id, project.title || 'project')}>
                            <FileArchive className="w-4 h-4 mr-2" />
                            Export as .dra
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => handleExportPNG(project.id, project.title || 'drawing')}>
                            <Image className="w-4 h-4 mr-2" />
                            Export as PNG
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => handleExportPDF(project.id, project.title || 'drawing')}>
                            <FileText className="w-4 h-4 mr-2" />
                            Export as PDF
                          </DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      {(project.role === 'owner' || !project.role) && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onSelect={(e) => {
                              e.preventDefault();
                              if (!confirm('Are you sure you want to delete this project?')) {
                                return;
                              }
                              getToken().then(token => {
                                deleteProject(project.id, token).then(() => {
                                  setProjects(prev => prev.filter(p => p.id !== project.id));
                                  if (currentProjectId === project.id) {
                                    const store = useDrawingStore.getState();
                                    store.newProject();
                                    store.clearCanvas();
                                    setCurrentProject(undefined);
                                  }
                                  toast({ title: 'Project deleted' });
                                });
                              }).catch(() => {
                                toast({ title: 'Failed to delete', variant: 'destructive' });
                              });
                            }}
                            className="text-red-500 dark:text-red-400 focus:text-red-500 dark:focus:text-red-400"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                
                <div className="mt-auto flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDistanceToNow(project.updatedAt, { addSuffix: true })}
                  </div>
                  <div className="flex items-center gap-2">
                    {project.role && project.role !== 'owner' && (
                      <span className="bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold border border-blue-200 dark:border-blue-500/20 flex items-center gap-1">
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
            {filteredProjects.map(project => (
              <div 
                key={project.id}
                onClick={(e) => handleCardClick(project.id, e)}
                className="group relative flex items-center gap-4 bg-white dark:bg-slate-800/30 border border-slate-200 dark:border-white/5 hover:border-blue-400 dark:hover:border-blue-500/30 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg p-3 cursor-pointer transition-all duration-200 shadow-sm"
              >
                <div className="w-16 h-12 bg-slate-100 dark:bg-slate-900/50 rounded border border-slate-200 dark:border-white/5 flex items-center justify-center shrink-0">
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
                      className="h-7 text-sm bg-slate-100 dark:bg-slate-900 border-blue-500 max-w-xs"
                      autoFocus
                    />
                  ) : (
                    <div className="font-medium truncate text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
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
                    <span className="bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold border border-blue-200 dark:border-blue-500/20 flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {project.role}
                    </span>
                  )}
                  {project.shared && (
                    <span className="bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold border border-emerald-200 dark:border-emerald-500/20">
                      Shared
                    </span>
                  )}
                  
                  <DropdownMenu 
                    modal={true}
                    onOpenChange={(open) => handleMenuOpenChange(open, project.id)}
                  >
                    <DropdownMenuTrigger asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent 
                      align="end" 
                      className="w-48"
                      onCloseAutoFocus={(e) => e.preventDefault()}
                      onPointerDownOutside={() => { menuClosedAtRef.current = Date.now(); }}
                      onInteractOutside={() => { menuClosedAtRef.current = Date.now(); }}
                    >
                      <DropdownMenuItem onSelect={() => {
                        setRenameValue(project.title || '');
                        setRenamingId(project.id);
                      }}>
                        <Pencil className="w-4 h-4 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      {!isGuest && (project.role === 'owner' || !project.role) && (
                        <DropdownMenuItem onSelect={() => setSharingProject(project)}>
                          <Share2 className="w-4 h-4 mr-2" />
                          Share
                        </DropdownMenuItem>
                      )}
                      {!isGuest && (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <FolderInput className="w-4 h-4 mr-2" />
                            Move to folder
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                          <DropdownMenuItem onSelect={() => handleMoveToFolder(project.id, null)}>
                            <Home className="w-4 h-4 mr-2" />
                            All Projects
                          </DropdownMenuItem>
                          {folders.length > 0 && <DropdownMenuSeparator />}
                          {folders.map(f => (
                            <DropdownMenuItem
                              key={f.id}
                              onSelect={() => handleMoveToFolder(project.id, f.id)}
                            >
                              <Folder className="w-4 h-4 mr-2" style={{ color: f.color }} />
                              {f.name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      )}
                      <DropdownMenuItem onSelect={() => {
                        getToken().then(token => {
                          getProject<ReturnType<typeof serializeProject>>(project.id, token).then(record => {
                            createProject(`${project.title} (Copy)`, record.data, token).then(() => {
                              loadData();
                              toast({ title: 'Project duplicated' });
                            });
                          });
                        }).catch(() => toast({ title: 'Failed to duplicate', variant: 'destructive' }));
                      }}>
                        <Copy className="w-4 h-4 mr-2" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <Download className="w-4 h-4 mr-2" />
                          Export
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          <DropdownMenuItem onSelect={() => handleExportDRA(project.id, project.title || 'project')}>
                            <FileArchive className="w-4 h-4 mr-2" />
                            Export as .dra
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => handleExportPNG(project.id, project.title || 'drawing')}>
                            <Image className="w-4 h-4 mr-2" />
                            Export as PNG
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => handleExportPDF(project.id, project.title || 'drawing')}>
                            <FileText className="w-4 h-4 mr-2" />
                            Export as PDF
                          </DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      {(project.role === 'owner' || !project.role) && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onSelect={(e) => {
                              e.preventDefault();
                              if (!confirm('Are you sure you want to delete this project?')) {
                                return;
                              }
                              getToken().then(token => {
                                deleteProject(project.id, token).then(() => {
                                  setProjects(prev => prev.filter(p => p.id !== project.id));
                                  if (currentProjectId === project.id) {
                                    const store = useDrawingStore.getState();
                                    store.newProject();
                                    store.clearCanvas();
                                    setCurrentProject(undefined);
                                  }
                                  toast({ title: 'Project deleted' });
                                });
                              }).catch(() => {
                                toast({ title: 'Failed to delete', variant: 'destructive' });
                              });
                            }}
                            className="text-red-500 dark:text-red-400 focus:text-red-500 dark:focus:text-red-400"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </div>
  </div>

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
