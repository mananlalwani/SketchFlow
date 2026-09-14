import { FOLDER_COLORS, type ProjectLibrary } from '@/components/projectManager/useProjectLibrary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Trash2,
  FileEdit,
  MoreHorizontal,
  Pencil,
  Folder,
  FolderPlus,
  Home,
} from 'lucide-react';
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
import { ALL_NOTES_FOLDER_ID } from '@/lib/projectList';

export function ProjectFolderSidebar({ lib }: { lib: ProjectLibrary }) {
  const {
    folders,
    projects,
    searchQuery,
    selectedFolderId,
    setSelectedFolderId,
    renamingFolderId,
    setRenamingFolderId,
    folderRenameValue,
    setFolderRenameValue,
    setCreatingFolder,
    isGuest,
    showFolderNavigation,
    handleRenameFolder,
    handleDeleteFolder,
    handleFolderColor,
  } = lib;

  return (
    <>
          {/* Folder Sidebar */}
          <div
            className={`${showFolderNavigation ? 'hidden md:flex' : 'hidden'} w-64 shrink-0 flex-col border-r border-stone-200/90 bg-stone-100/55 transition-colors duration-200 dark:border-white/[0.08] dark:bg-stone-950/50`}
          >
            <div className="border-b border-stone-200/90 px-4 py-4 dark:border-white/[0.08]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-600 dark:text-stone-400">
                    Notes
                  </p>
                  <p className="mt-1 text-sm font-semibold tracking-[-0.02em] text-stone-900 dark:text-stone-100">
                    {isGuest ? 'Local notes' : 'Folders'}
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
                onClick={() => setSelectedFolderId(ALL_NOTES_FOLDER_ID)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                  selectedFolderId === ALL_NOTES_FOLDER_ID && !searchQuery
                    ? 'bg-stone-900 text-amber-100 shadow-sm dark:bg-amber-300 dark:text-stone-950'
                    : 'text-stone-600 dark:text-stone-400 hover:bg-stone-200/70 hover:text-stone-950 dark:hover:bg-white/[0.06] dark:hover:text-stone-100'
                }`}
              >
                <Home className="w-4 h-4" />
                <span className="truncate flex-1">All notes</span>
                <span className="text-xs font-medium opacity-60">{projects.length}</span>
                {/* Spacer to align with folder dropdown buttons */}
                <div className="w-6 h-6" />
              </button>

              <button
                type="button"
                onClick={() => setSelectedFolderId(null)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                  selectedFolderId === null && !searchQuery
                    ? 'bg-stone-900 text-amber-100 shadow-sm dark:bg-amber-300 dark:text-stone-950'
                    : 'text-stone-600 dark:text-stone-400 hover:bg-stone-200/70 hover:text-stone-950 dark:hover:bg-white/[0.06] dark:hover:text-stone-100'
                }`}
              >
                <FileEdit className="h-4 w-4" />
                <span className="truncate flex-1">Unfiled notes</span>
                <span className="text-xs font-medium opacity-60">
                  {projects.filter((p) => !p.folderId).length}
                </span>
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
                                    await handleFolderColor(folder, c.value);
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
    </>
  );
}
