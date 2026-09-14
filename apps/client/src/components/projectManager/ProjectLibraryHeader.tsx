import type { ProjectLibrary } from '@/components/projectManager/useProjectLibrary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Plus,
  FolderOpen,
  Clock,
  Loader2,
  Search,
  Grid3X3,
  List,
  SortAsc,
  SortDesc,
  Upload,
  FileText,
  FileArchive,
  Sparkles,
  Calendar,
  Type,
  Folder,
  FolderPlus,
} from 'lucide-react';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ALL_NOTES_FOLDER_ID } from '@/lib/projectList';

export function ProjectLibraryHeader({ lib }: { lib: ProjectLibrary }) {
  const {
    folders,
    creating,
    searchQuery,
    setSearchQuery,
    sortBy,
    sortDirection,
    viewMode,
    setViewMode,
    selectedFolderId,
    setSelectedFolderId,
    creatingFolder,
    setCreatingFolder,
    newFolderName,
    setNewFolderName,
    showNewProjectDialog,
    setShowNewProjectDialog,
    newProjectName,
    setNewProjectName,
    isGuest,
    isMobile,
    showFolderNavigation,
    currentProjectId,
    filteredProjects,
    lastProject,
    currentFolderName,
    handleCreateFolder,
    openNewProjectDialog,
    handleCreate,
    handleLoad,
    handleImportDRA,
    handleImportPDF,
    handleQuickCreate,
    toggleSort,
  } = lib;

  return (
    <>
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
                    {filteredProjects.length} note{filteredProjects.length !== 1 ? 's' : ''}
                    {searchQuery && ` matching "${searchQuery}"`}
                  </p>
                  {lastProject && lastProject.id !== currentProjectId && (
                    <button
                      type="button"
                      onClick={() => void handleLoad(lastProject.id)}
                      className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-amber-300/70 bg-amber-100/80 px-3 py-1.5 text-xs font-semibold text-amber-950 transition-colors hover:bg-amber-200 dark:border-amber-300/25 dark:bg-amber-300/10 dark:text-amber-100 dark:hover:bg-amber-300/20"
                    >
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        Continue “{lastProject.title || 'Untitled note'}”
                      </span>
                    </button>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-stone-300 dark:border-white/10"
                        title="Import note"
                        aria-label="Import note"
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
                    variant="outline"
                    onClick={() => void handleQuickCreate()}
                    disabled={creating}
                    className="border-stone-300 dark:border-white/10"
                    title="Create a note and open it immediately"
                  >
                    <Sparkles className="mr-0 h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Quick note</span>
                  </Button>
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
                    <span className="sm:hidden">New note</span>
                    <span className="hidden sm:inline">New note</span>
                  </Button>
                </div>
              </div>

              {isMobile && (
                <div className="mb-3">
                  <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <button
                      type="button"
                      onClick={() => setSelectedFolderId(ALL_NOTES_FOLDER_ID)}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        selectedFolderId === ALL_NOTES_FOLDER_ID && !searchQuery
                          ? 'bg-amber-300 text-stone-950'
                          : 'bg-stone-100 text-stone-600 dark:bg-stone-900 dark:text-stone-300'
                      }`}
                    >
                      All notes
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedFolderId(null)}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        selectedFolderId === null && !searchQuery
                          ? 'bg-amber-300 text-stone-950'
                          : 'bg-stone-100 text-stone-600 dark:bg-stone-900 dark:text-stone-300'
                      }`}
                    >
                      Unfiled
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

              {/* New Note Dialog */}
              <Dialog open={showNewProjectDialog} onOpenChange={setShowNewProjectDialog}>
                <DialogContent className="gap-0 overflow-hidden border-stone-200 bg-stone-50 p-0 sm:max-w-md dark:border-white/[0.09] dark:bg-[#211e1b]">
                  <DialogHeader className="border-b border-stone-200 bg-stone-100/80 px-6 pb-5 pt-6 text-left dark:border-white/[0.08] dark:bg-white/[0.025]">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-900 text-amber-200 shadow-sm shadow-stone-950/15 dark:bg-amber-300 dark:text-stone-950">
                        <Plus className="h-5 w-5" strokeWidth={2.25} />
                      </span>
                      <div>
                        <DialogTitle className="text-xl font-semibold tracking-[-0.04em] text-stone-950 dark:text-stone-50">
                          New note
                        </DialogTitle>
                        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                          Start with a clean canvas.
                        </p>
                      </div>
                    </div>
                  </DialogHeader>
                  <div className="px-6 py-5">
                    <label className="grid gap-2 text-sm font-medium text-stone-700 dark:text-stone-200">
                      Note title
                      <Input
                        placeholder="Untitled note"
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
                    placeholder="Search notes..."
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

    </>
  );
}
