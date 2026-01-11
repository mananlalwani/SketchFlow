import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Keyboard } from "lucide-react";

interface ShortcutsDialogProps {
  mode: 'draw' | 'view';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
}

export function ShortcutsDialog({ mode, open, onOpenChange, showTrigger = true }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {showTrigger && (
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" title="Keyboard Shortcuts (?)" className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
            <Keyboard className="w-4 h-4" />
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl max-h-[85vh] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-200">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-8 py-4 overflow-y-auto max-h-[calc(85vh-8rem)] pr-2">
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold mb-3 text-blue-600 dark:text-blue-400">Tools</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Hand / Pan</span>
                  <kbd className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">Space (Hold)</kbd>
                </div>
                {mode === 'draw' && (
                  <>
                    <div className="flex justify-between">
                      <span>Pen / Brush</span>
                      <kbd className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">P / B</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>Eraser</span>
                      <kbd className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">E</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>Line</span>
                      <kbd className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">L</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>Rectangle</span>
                      <kbd className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">R</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>Circle / Ellipse</span>
                      <kbd className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">C / O</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>Triangle</span>
                      <kbd className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">3</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>Text</span>
                      <kbd className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">T</kbd>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="font-semibold mb-3 text-green-600 dark:text-green-400">Actions</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Zoom In</span>
                  <kbd className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">Ctrl +</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Zoom Out</span>
                  <kbd className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">Ctrl -</kbd>
                </div>
                <div className="flex justify-between">
                  <span>Reset Zoom</span>
                  <kbd className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">Ctrl 0</kbd>
                </div>
                {mode === 'draw' && (
                  <>
                    <div className="flex justify-between">
                      <span>Undo</span>
                      <kbd className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">Ctrl Z</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>Redo</span>
                      <kbd className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">Ctrl Y</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>Clear Canvas</span>
                      <kbd className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">Ctrl Del</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>Save Project</span>
                      <kbd className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">Ctrl S</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>Open Project</span>
                      <kbd className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">Ctrl O</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>New Project</span>
                      <kbd className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">Ctrl N</kbd>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-3 text-orange-600 dark:text-orange-400">Export & Clipboard</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Export as PNG</span>
                  <span className="text-slate-500">Top bar → PNG</span>
                </div>
                <div className="flex justify-between">
                  <span>Export as SVG</span>
                  <span className="text-slate-500">Top bar → SVG</span>
                </div>
                <div className="flex justify-between">
                  <span>Paste Image</span>
                  <kbd className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">Ctrl V</kbd>
                </div>
              </div>
            </div>
            
            {mode === 'draw' && (
              <div>
                <h3 className="font-semibold mb-3 text-purple-600 dark:text-purple-400">Modifiers</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Constraint (Square/Circle)</span>
                    <kbd className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">Shift</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span>Show this dialog</span>
                    <kbd className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">?</kbd>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
