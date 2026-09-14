import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Copy, Download, RotateCcw, Trash2 } from 'lucide-react';
import { clientEnv } from '@/config/env';
import type { DrawingState } from '@/store/drawingStore';

export function SettingsDevToolsDialog({
  open,
  onOpenChange,
  drawingState,
  socketConnected,
  connectionCount,
  connectionError,
  devStorageInfo,
  isAuthenticated,
  userId,
  copyDiagnostics,
  exportCurrentDocument,
  resetRecoveryNotice,
  resetIntro,
  clearCaches,
  devActionMessage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drawingState: DrawingState;
  socketConnected: boolean;
  connectionCount: number;
  connectionError: { message?: string } | null | undefined;
  devStorageInfo: {
    offlineSaves: string;
    backup: string;
    apiLatency: string;
    caches: string;
    quota: string;
  };
  isAuthenticated: boolean;
  userId?: string;
  copyDiagnostics: () => void;
  exportCurrentDocument: () => void;
  resetRecoveryNotice: () => void;
  resetIntro: () => void;
  clearCaches: () => void;
  devActionMessage: string | null;
}) {
  return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="gap-0 overflow-hidden border-stone-200 bg-stone-50 p-0 sm:max-w-lg dark:border-white/[0.09] dark:bg-[#211e1b]">
          <DialogHeader className="border-b border-stone-200 bg-stone-100/80 px-6 pb-5 pt-6 text-left dark:border-white/[0.08] dark:bg-white/[0.025]">
            <DialogTitle className="text-xl font-semibold tracking-[-0.04em] text-stone-950 dark:text-stone-50">
              Developer tools
            </DialogTitle>
            <DialogDescription className="mt-1 text-stone-500 dark:text-stone-400">
              Runtime diagnostics for local development and support.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto px-6 py-5 text-sm">
            <div className="grid gap-3">
              {[
                ['Mode', clientEnv.IS_PRODUCTION ? 'production' : 'development'],
                ['Release', clientEnv.RELEASE_ID],
                ['API origin', clientEnv.API_URL || 'same origin'],
                ['Online', navigator.onLine ? 'yes' : 'no'],
                ['Project', drawingState.currentProjectId || 'unsaved draft'],
                ['Objects', String(drawingState.objects.length)],
                ['History', `${drawingState.historyIndex + 1} / ${drawingState.history.length}`],
                ['Save status', drawingState.saveStatus],
                ['Route', window.location.pathname],
                [
                  'Viewport',
                  `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x`,
                ],
                ['Touch input', 'ontouchstart' in window ? 'yes' : 'no'],
                ['Socket', socketConnected ? `connected (${connectionCount})` : 'disconnected'],
                ['Socket error', connectionError?.message || 'none'],
                ['Offline queue', devStorageInfo.offlineSaves],
                ['Recovery backup', devStorageInfo.backup],
                ['API latency', devStorageInfo.apiLatency],
                ['App caches', devStorageInfo.caches],
                ['Storage', devStorageInfo.quota],
                ['Auth', isAuthenticated ? 'authenticated' : 'guest'],
                ['User', userId ? `…${userId.slice(-6)}` : 'none'],
                [
                  'Document',
                  `${drawingState.documentVersion} / revision ${drawingState.projectRevision ?? 'none'}`,
                ],
                ['Selected', String(drawingState.selectedObjectIds.length)],
                ['Tool', drawingState.currentTool],
                [
                  'Canvas',
                  `${drawingState.zoom.toFixed(2)}x @ ${Math.round(drawingState.viewX)},${Math.round(drawingState.viewY)}`,
                ],
                ['Visibility', document.visibilityState],
                [
                  'Locale',
                  `${navigator.language} / ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
                ],
                ['Screen', `${window.screen.width}×${window.screen.height}`],
                [
                  'Network',
                  'connection' in navigator
                    ? // SAFETY: the feature check above guarantees the non-standard connection field exists.
                      (
                        navigator as Navigator & {
                          connection?: { effectiveType?: string; rtt?: number };
                        }
                      ).connection?.effectiveType || 'available'
                    : 'unavailable',
                ],
                [
                  'Memory',
                  'memory' in performance
                    ? // SAFETY: the feature check above guarantees the non-standard memory field exists.
                      `${Math.round((performance as Performance & { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize / 1024 / 1024)} MB heap`
                    : 'unavailable',
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-4 rounded-lg border border-stone-200 bg-white px-3 py-2 dark:border-white/[0.08] dark:bg-white/[0.035]"
                >
                  <span className="text-stone-500 dark:text-stone-400">{label}</span>
                  <span className="max-w-[18rem] truncate font-mono text-xs text-stone-800 dark:text-stone-200">
                    {value}
                  </span>
                </div>
              ))}
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-stone-200 pt-4 dark:border-white/[0.08]">
                <Button variant="outline" size="sm" onClick={() => void copyDiagnostics()}>
                  <Copy className="mr-2 h-4 w-4" /> Copy diagnostics
                </Button>
                <Button variant="outline" size="sm" onClick={exportCurrentDocument}>
                  <Download className="mr-2 h-4 w-4" /> Export document
                </Button>
                <Button variant="outline" size="sm" onClick={resetRecoveryNotice}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Reset recovery notice
                </Button>
                <Button variant="outline" size="sm" onClick={resetIntro}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Reset intro/tutorial
                </Button>
                <Button variant="outline" size="sm" onClick={() => void clearCaches()}>
                  <Trash2 className="mr-2 h-4 w-4" /> Clear app caches
                </Button>
              </div>
              {devActionMessage && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">{devActionMessage}</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
  );
}
