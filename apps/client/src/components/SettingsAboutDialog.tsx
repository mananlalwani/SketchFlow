import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { PenTool } from 'lucide-react';

export function SettingsAboutDialog({
  open,
  onOpenChange,
  onVersionPointerDown,
  devToolsUnlocked,
  onOpenDevTools,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVersionPointerDown: () => void;
  devToolsUnlocked: boolean;
  onOpenDevTools: () => void;
}) {
  return (
<Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="gap-0 overflow-hidden border-stone-200 bg-stone-50 p-0 sm:max-w-md dark:border-white/[0.09] dark:bg-[#211e1b]">
          <DialogHeader className="border-b border-stone-200 bg-stone-100/80 px-6 pb-5 pt-6 text-left dark:border-white/[0.08] dark:bg-white/[0.025]">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-stone-900 text-amber-200 shadow-sm shadow-stone-950/15 dark:bg-amber-300 dark:text-stone-950">
                <PenTool className="h-5 w-5" strokeWidth={2.35} />
              </span>
              <div>
                <DialogTitle className="text-xl font-semibold tracking-[-0.04em] text-stone-950 dark:text-stone-50">
                  SketchFlow
                </DialogTitle>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-600 dark:text-stone-400">
                  Canvas
                </p>
              </div>
            </div>
          </DialogHeader>
          <DialogDescription asChild>
            <div className="space-y-5 px-6 py-5">
              <p className="text-sm leading-6 text-stone-600 dark:text-stone-300">
                A shared canvas for rough ideas, diagrams, notes, and the conversations around them.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {['Draw together', 'Keep it moving', 'Pick up anywhere'].map((feature) => (
                  <div
                    key={feature}
                    className="rounded-lg border border-stone-200 bg-white px-2 py-2.5 text-center text-[11px] font-medium leading-4 text-stone-700 dark:border-white/[0.08] dark:bg-white/[0.035] dark:text-stone-300"
                  >
                    {feature}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-stone-200 pt-4 text-xs dark:border-white/[0.08]">
                <span onPointerDown={onVersionPointerDown}>Version 1.0.0</span>
                <span className="text-stone-600 dark:text-stone-400">
                  © {new Date().getFullYear()} Manan Lalwani
                </span>
              </div>
              {devToolsUnlocked && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={onOpenDevTools}
                >
                  Developer tools
                </Button>
              )}
            </div>
          </DialogDescription>
        </DialogContent>
      </Dialog>
  );
}
