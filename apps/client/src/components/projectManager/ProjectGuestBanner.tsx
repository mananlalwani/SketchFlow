import { Button } from '@/components/ui/button';
import type { ProjectLibrary } from '@/components/projectManager/useProjectLibrary';
import { Info, X } from 'lucide-react';

export function ProjectGuestBanner({ lib }: { lib: ProjectLibrary }) {
  const { isGuest, guestBannerDismissed, handleDismissBanner } = lib;
  if (!isGuest || guestBannerDismissed) return null;

  return (
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
              Notes are saved locally. Sign in to sync and collaborate.
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
  );
}
