import { useProjectLibrary } from '@/components/projectManager/useProjectLibrary';
import { ProjectFolderSidebar } from '@/components/projectManager/ProjectFolderSidebar';
import { ProjectGuestBanner } from '@/components/projectManager/ProjectGuestBanner';
import { ProjectLibraryBoard } from '@/components/projectManager/ProjectLibraryBoard';
import { ProjectLibraryDialogs } from '@/components/projectManager/ProjectLibraryDialogs';
import { ProjectLibraryHeader } from '@/components/projectManager/ProjectLibraryHeader';
import { Loader2 } from 'lucide-react';

export function ProjectManager({ onSelect }: { onSelect?: () => void }) {
  const lib = useProjectLibrary(onSelect);
  if (!lib.isLoaded)
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-slate-400" />
      </div>
    );

  return (
    <>
      <div className="flex h-full w-full flex-col bg-[#fbfaf7] text-stone-900 transition-colors duration-200 dark:bg-[#171513] dark:text-stone-100">
        <ProjectGuestBanner lib={lib} />
        <div className="flex flex-1 overflow-hidden">
          <ProjectFolderSidebar lib={lib} />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <ProjectLibraryHeader lib={lib} />
            <ProjectLibraryBoard lib={lib} />
          </div>
        </div>
      </div>
      <ProjectLibraryDialogs lib={lib} />
    </>
  );
}
