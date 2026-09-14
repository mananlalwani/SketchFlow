import type { ProjectLibrary } from '@/components/projectManager/useProjectLibrary';
import { ProjectNoteActions } from '@/components/projectManager/ProjectNoteActions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Plus,
  Clock,
  Loader2,
  FileEdit,
  Users,
  Search,
  Upload,
  Sparkles,
  Calendar,
  FileArchive,
  FileText,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ALL_NOTES_FOLDER_ID } from '@/lib/projectList';

export function ProjectLibraryBoard({ lib }: { lib: ProjectLibrary }) {
  const {
    loading,
    creating,
    searchQuery,
    viewMode,
    renamingId,
    setRenamingId,
    renameValue,
    setRenameValue,
    selectedFolderId,
    isGuest,
    handleCardClick,
    filteredProjects,
    recentProjects,
    openNewProjectDialog,
    handleCreateGuestProject,
    handleLoad,
    handleRename,
    handleImportDRA,
    handleImportPDF,
  } = lib;

  return (
    <>
            <div className="flex-1 overflow-y-auto bg-[#f7f5f0] px-4 pb-4 pt-3 transition-colors duration-200 dark:bg-[#171513] sm:p-7">
              {!loading &&
                !searchQuery &&
                selectedFolderId === ALL_NOTES_FOLDER_ID &&
                recentProjects.length > 0 && (
                  <section aria-labelledby="recent-notes-heading" className="mb-7">
                    <div className="mb-3 flex items-end justify-between gap-3">
                      <div>
                        <h3
                          id="recent-notes-heading"
                          className="text-sm font-semibold uppercase tracking-[0.14em] text-stone-700 dark:text-stone-300"
                        >
                          Recent notes
                        </h3>
                        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                          Pick up where you left off.
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {recentProjects.map((project) => (
                        <button
                          key={project.id}
                          type="button"
                          onClick={() => void handleLoad(project.id)}
                          className="surface-raised group flex min-w-0 items-center gap-3 rounded-xl border-l-2 border-l-amber-300 bg-stone-50 p-3 text-left transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:bg-white dark:bg-stone-900/60 dark:hover:bg-stone-900"
                        >
                          <span className="flex h-12 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-stone-200 bg-stone-100 dark:border-white/[0.07] dark:bg-stone-950/60">
                            {project.thumbnail ? (
                              <img
                                src={project.thumbnail}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <FileEdit className="h-5 w-5 text-stone-400 dark:text-stone-600" />
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-stone-900 group-hover:text-amber-700 dark:text-stone-100 dark:group-hover:text-amber-200">
                              {project.title || 'Untitled note'}
                            </span>
                            <span className="mt-1 block truncate text-xs text-stone-500 dark:text-stone-400">
                              {formatDistanceToNow(project.updatedAt, { addSuffix: true })}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              {!loading &&
                !searchQuery &&
                selectedFolderId === ALL_NOTES_FOLDER_ID &&
                recentProjects.length > 0 && (
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-stone-700 dark:text-stone-300">
                    All notes
                  </h3>
                )}
              {loading ? (
                <div className="flex-1 flex items-center justify-center h-64">
                  <Loader2 className="w-8 h-8 animate-spin text-slate-400 dark:text-slate-500" />
                </div>
              ) : filteredProjects.length === 0 ? (
                searchQuery ? (
                  <div className="flex flex-col items-center justify-center h-64 text-center">
                    <Search className="w-12 h-12 text-slate-400 dark:text-slate-600 mb-4" />
                    <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">
                      No matching notes
                    </h3>
                    <p className="text-slate-500">Try a different search term</p>
                  </div>
                ) : (
                  <div className="flex h-64 flex-col items-center justify-center rounded-3xl border border-dashed border-stone-300 bg-stone-50/70 p-12 dark:border-white/[0.12] dark:bg-stone-900/35">
                    <Sparkles className="mb-4 h-12 w-12 text-amber-500 dark:text-amber-300" />
                    <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">
                      {isGuest ? 'Start a note locally' : 'Start a note'}
                    </h3>
                    <p className="text-slate-900 dark:text-slate-100 mb-6 text-center max-w-sm">
                      {isGuest
                        ? 'Create a local note. Sign in to sync and collaborate.'
                        : 'Create your first note or import an existing one.'}
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
                            {isGuest ? 'Start a note' : 'New note'}
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

                        <ProjectNoteActions project={project} lib={lib} layout="grid" />
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
                      <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-stone-200 bg-stone-100 dark:border-white/[0.07] dark:bg-stone-950/60">
                        {project.thumbnail ? (
                          <img
                            src={project.thumbnail}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <FileEdit className="w-5 h-5 text-slate-400 dark:text-slate-700" />
                        )}
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

                        <ProjectNoteActions project={project} lib={lib} layout="list" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
    </>
  );
}
