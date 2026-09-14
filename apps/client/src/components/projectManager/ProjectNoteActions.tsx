import type { ProjectListItem } from '@/lib/api';
import type { ProjectLibrary } from '@/components/projectManager/useProjectLibrary';
import { Button } from '@/components/ui/button';
import {
  Copy,
  Download,
  FileArchive,
  FileText,
  Folder,
  FolderInput,
  Home,
  Image,
  MoreHorizontal,
  Pencil,
  Share2,
  Trash2,
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
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
  DrawerClose,
  DrawerTrigger,
} from '@/components/ui/drawer';

export function ProjectNoteActions({
  project,
  lib,
  layout,
}: {
  project: ProjectListItem;
  lib: ProjectLibrary;
  layout: 'grid' | 'list';
}) {
  const {
    folders,
    setSharingProject,
    setMobileRenameProject,
    setMobileRenameValue,
    setRenameValue,
    setRenamingId,
    isGuest,
    isMobile,
    showFolderNavigation,
    handleMenuOpenChange,
    handleMoveToFolder,
    handleDeleteProject,
    handleExportPNG,
    handleExportPDF,
    handleExportDRA,
    menuClosedAtRef,
    handleDuplicate,
  } = lib;

  const triggerClassName =
    layout === 'grid'
      ? isMobile
        ? 'absolute top-3 right-3 opacity-100 h-8 w-8 bg-white/50 dark:bg-black/50 backdrop-blur-sm rounded-full'
        : 'absolute top-3 right-3 opacity-0 group-hover:opacity-100 h-8 w-8 transition-opacity'
      : 'h-8 w-8';

  if (isMobile) {
    return (
      <Drawer>
        <DrawerTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={triggerClassName}
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
              onClick={() => void handleDuplicate(project)}
            >
              <Copy className="w-4 h-4 mr-2" />
              Duplicate
            </Button>
            <div className="text-sm font-medium text-muted-foreground mt-4 mb-2">Export</div>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleExportDRA(project.id, project.title || 'project')}
              >
                <FileArchive className="w-4 h-4 mr-2" />
                .dra
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleExportPNG(project.id, project.title || 'drawing')}
              >
                <Image className="w-4 h-4 mr-2" />
                PNG
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleExportPDF(project.id, project.title || 'drawing')}
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
    );
  }

  return (
    <DropdownMenu modal={true} onOpenChange={(open) => handleMenuOpenChange(open, project.id)}>
      <DropdownMenuTrigger asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Actions for ${project.title || 'Untitled'}`}
          className={triggerClassName}
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
              <DropdownMenuItem onSelect={() => handleMoveToFolder(project.id, null)}>
                <Home className="w-4 h-4 mr-2" />
                Unfiled notes
              </DropdownMenuItem>
              {folders.length > 0 && <DropdownMenuSeparator />}
              {folders.map((folder) => (
                <DropdownMenuItem
                  key={folder.id}
                  onSelect={() => handleMoveToFolder(project.id, folder.id)}
                >
                  <Folder className="w-4 h-4 mr-2" style={{ color: folder.color }} />
                  {folder.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuItem onSelect={() => void handleDuplicate(project)}>
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
              onSelect={() => handleExportDRA(project.id, project.title || 'project')}
            >
              <FileArchive className="w-4 h-4 mr-2" />
              Export as .dra
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => handleExportPNG(project.id, project.title || 'drawing')}
            >
              <Image className="w-4 h-4 mr-2" />
              Export as PNG
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => handleExportPDF(project.id, project.title || 'drawing')}
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
  );
}
