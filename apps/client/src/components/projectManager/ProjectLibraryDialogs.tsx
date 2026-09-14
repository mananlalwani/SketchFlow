import type { ProjectLibrary } from '@/components/projectManager/useProjectLibrary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { ProjectShareDialog } from '@/components/ProjectShareDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

export function ProjectLibraryDialogs({ lib }: { lib: ProjectLibrary }) {
  const {
    mobileRenameProject,
    setMobileRenameProject,
    mobileRenameValue,
    setMobileRenameValue,
    isRenamingMobileProject,
    handleMobileRename,
    sharingProject,
    setSharingProject,
    loadData,
  } = lib;

  return (
    <>
      <Dialog
        open={!!mobileRenameProject}
        onOpenChange={(open) => {
          if (!open && !isRenamingMobileProject) setMobileRenameProject(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename note</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-3">
            <label
              className="text-sm font-medium text-stone-700 dark:text-stone-200"
              htmlFor="mobile-project-name"
            >
              Note title
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
