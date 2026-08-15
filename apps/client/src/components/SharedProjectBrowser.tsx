import { useAuth } from '@clerk/clerk-react';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { listProjects, type ProjectListItem, getProject, getSharedProject } from '@/lib/api';
import { useDrawingStore } from '@/store/drawingStore';
import { deserializeProject } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Eye,
  Loader2,
  Search,
  Grid3X3,
  List,
  Clock,
  Users,
  Link2,
  ExternalLink,
  Share2,
  FileEdit,
  Sparkles,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

type ViewMode = 'grid' | 'list';

interface SharedProjectBrowserProps {
  onProjectLoad?: () => void;
}

export function SharedProjectBrowser({ onProjectLoad }: SharedProjectBrowserProps) {
  const { getToken, userId, isLoaded } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [loadingProject, setLoadingProject] = useState<string | null>(null);
  const { setObjects, replaceHistory, requestFullRedraw, setProjectTitle, setCurrentProject } =
    useDrawingStore();

  const loadSharedProject = useCallback(
    async (shareToken: string) => {
      setLoadingProject(shareToken);
      try {
        const record = await getSharedProject(shareToken);
        // Data is a serialized string, so we deserialize it to count objects
        const projectData = deserializeProject(record.data);
        console.log(
          'Loaded shared project:',
          record.id,
          record.title,
          `(${Array.isArray(projectData) ? projectData.length : 0} objects)`,
        );

        // Set project title immediately for better UX
        setProjectTitle(record.title || 'Shared Project');
        setCurrentProject(record.id); // Set the current project ID for socket connections

        // Clear current canvas and show loading state
        setObjects([]);
        requestFullRedraw();

        // Deserialize objects (this can be heavy for large projects)
        const objects = deserializeProject(record.data);

        // Load objects and trigger redraw
        setObjects(objects);
        replaceHistory(objects);
        requestFullRedraw();

        toast({ title: 'Shared project loaded', description: `Viewing "${record.title}"` });
        onProjectLoad?.();
      } catch (e) {
        console.error('Failed to load shared project:', e);
        const errorMessage =
          e instanceof Error ? e.message : 'The shared project could not be found.';
        toast({
          title: 'Failed to load shared project',
          description: errorMessage,
          variant: 'destructive',
        });
      } finally {
        setLoadingProject(null);
      }
    },
    [
      setObjects,
      replaceHistory,
      setCurrentProject,
      requestFullRedraw,
      setProjectTitle,
      toast,
      onProjectLoad,
    ],
  );

  useEffect(() => {
    const shareToken = searchParams.get('share');
    if (shareToken) {
      loadSharedProject(shareToken);
    }
  }, [searchParams, loadSharedProject]);

  const loadProjects = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const token = await getToken();
      const list = await listProjects(token);
      const sharedProjects = list
        .filter((p) => p && p.id && (p.shared || p.role === 'editor' || p.role === 'viewer'))
        .map((p) => ({
          ...p,
          shared: p.shared ?? false,
          role: p.role ?? 'owner',
        }));
      setProjects(sharedProjects);
    } catch (e) {
      console.error('Failed to load projects:', e);
      toast({ title: 'Failed to load projects', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [userId, getToken, toast]);

  useEffect(() => {
    if (isLoaded && userId) {
      loadProjects();
    }
  }, [isLoaded, userId, loadProjects]);

  const filteredProjects = useMemo(() => {
    let result = [...projects];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((p) => p.title?.toLowerCase().includes(query));
    }

    return result.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }, [projects, searchQuery]);

  const handleViewProject = useCallback(
    async (project: ProjectListItem) => {
      setLoadingProject(project.id);
      try {
        const token = await getToken();
        const record = await getProject(project.id, token);
        console.log('Loaded project:', record.id, record.title);
        const objects = deserializeProject(record.data);
        setObjects(objects);
        replaceHistory(objects);
        setCurrentProject(record.id); // Set the current project ID for socket connections
        requestFullRedraw();
        setProjectTitle(record.title || 'Project');
        toast({ title: 'Project loaded', description: `Viewing "${record.title}"` });
        onProjectLoad?.();
      } catch (e) {
        console.error('Failed to load project:', e);
        const errorMessage = e instanceof Error ? e.message : 'Failed to load project';
        toast({
          title: 'Failed to load project',
          description: errorMessage,
          variant: 'destructive',
        });
      } finally {
        setLoadingProject(null);
      }
    },
    [
      getToken,
      setObjects,
      replaceHistory,
      setCurrentProject,
      requestFullRedraw,
      setProjectTitle,
      toast,
      onProjectLoad,
    ],
  );

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full animate-fade-in p-6 bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2 mb-2 text-slate-900 dark:text-slate-100">
          <Eye className="w-6 h-6 text-emerald-500 dark:text-emerald-400" />
          Shared Projects
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          View projects that have been shared with you or are publicly available.
        </p>
      </div>

      {/* Link Input */}
      <div className="mb-6 p-4 rounded-xl bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 shadow-sm transition-colors duration-200">
        <div className="flex items-center gap-2 mb-2">
          <Link2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Open Shared Link
          </span>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Paste a share link or token..."
            className="bg-slate-100 dark:bg-slate-900/50 border-slate-300 dark:border-white/10"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const input = e.currentTarget.value.trim();
                const match = input.match(/[?&]share=([^&]+)/);
                const token = match ? match[1] : input;
                if (token) {
                  navigate(`/draw?share=${token}`);
                  loadSharedProject(token);
                }
              }
            }}
          />
          <Button
            variant="default"
            className="bg-emerald-600 hover:bg-emerald-500"
            onClick={() => {
              const input = document.querySelector<HTMLInputElement>('input[placeholder*="share"]');
              if (input?.value) {
                const match = input.value.match(/[?&]share=([^&]+)/);
                const token = match ? match[1] : input.value.trim();
                if (token) {
                  navigate(`/draw?share=${token}`);
                  loadSharedProject(token);
                }
              }
            }}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Open
          </Button>
        </div>
      </div>

      {userId ? (
        <>
          {/* Search and View Toggle */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
              <Input
                placeholder="Search shared projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-white dark:bg-slate-800/50 border-slate-300 dark:border-white/10"
              />
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

          {/* Project List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400 dark:text-slate-500" />
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-300 dark:border-white/10 rounded-2xl bg-white/50 dark:bg-white/5 p-12">
                <Sparkles className="w-12 h-12 text-emerald-500 dark:text-emerald-400 mb-4" />
                <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300">
                  No Shared Projects
                </h3>
                <p className="text-slate-500 text-center max-w-sm mt-2">
                  Projects shared with you or marked as public will appear here. You can also paste
                  a share link above to view a project.
                </p>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredProjects.map((project) => (
                  <div
                    key={project.id}
                    onClick={() => handleViewProject(project)}
                    className="surface-raised group relative flex cursor-pointer flex-col gap-3 rounded-xl bg-white p-4 transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800"
                  >
                    {loadingProject === project.id && (
                      <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 rounded-xl flex items-center justify-center z-10">
                        <Loader2 className="w-6 h-6 animate-spin text-emerald-500 dark:text-emerald-400" />
                      </div>
                    )}

                    {/* Thumbnail placeholder */}
                    <div className="aspect-video bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-white/5 flex items-center justify-center mb-2 group-hover:border-emerald-400/20 dark:group-hover:border-emerald-500/20 transition-colors">
                      <FileEdit className="w-8 h-8 text-slate-400 dark:text-slate-700 group-hover:text-slate-500 dark:group-hover:text-slate-600 transition-colors" />
                    </div>

                    <div className="font-semibold truncate text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                      {project.title || 'Untitled'}
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
                          <span className="bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold border border-emerald-200 dark:border-emerald-500/20 flex items-center gap-1">
                            <Share2 className="w-3 h-3" />
                            Public
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredProjects.map((project) => (
                  <div
                    key={project.id}
                    onClick={() => handleViewProject(project)}
                    className="surface-raised group flex cursor-pointer items-center gap-4 rounded-lg bg-white p-3 transition-[background-color,box-shadow] duration-200 hover:bg-slate-50 dark:bg-slate-800/30 dark:hover:bg-slate-800/50"
                  >
                    {loadingProject === project.id && (
                      <Loader2 className="w-5 h-5 animate-spin text-emerald-500 dark:text-emerald-400" />
                    )}
                    <FileEdit
                      className={`w-5 h-5 text-slate-400 dark:text-slate-600 group-hover:text-emerald-500 dark:group-hover:text-emerald-400 transition-colors ${loadingProject === project.id ? 'hidden' : ''}`}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                        {project.title || 'Untitled'}
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Updated {formatDistanceToNow(project.updatedAt, { addSuffix: true })}
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
                        <span className="bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold border border-emerald-200 dark:border-emerald-500/20 flex items-center gap-1">
                          <Share2 className="w-3 h-3" />
                          Public
                        </span>
                      )}
                      <Eye className="w-4 h-4 text-slate-400 dark:text-slate-500 group-hover:text-emerald-500 dark:group-hover:text-emerald-400" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center flex-1 text-center">
          <Eye className="w-16 h-16 text-slate-400 dark:text-slate-600 mb-4" />
          <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-2">
            Sign in to see your shared projects
          </h3>
          <p className="text-slate-500 max-w-sm">
            You can still view projects by pasting a share link above.
          </p>
        </div>
      )}
    </div>
  );
}
