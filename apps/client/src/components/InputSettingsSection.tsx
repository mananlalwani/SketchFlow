import { Button } from '@/components/ui/button';
import { useDrawingStore } from '@/store/drawingStore';

export function InputSettingsSection({ mobile = false }: { mobile?: boolean }) {
  const {
    inputMode,
    setInputMode,
    fingerAction,
    setFingerAction,
    sessionStylusSuppression,
    setSessionStylusSuppression,
  } = useDrawingStore();
  const modeHelp = {
    auto: sessionStylusSuppression
      ? 'Stylus mode is active for this session; fingers follow the behavior below.'
      : 'Touch draws until a pen is observed or Stylus mode is enabled.',
    'stylus-only': 'Only a pen or mouse draws; finger input follows the setting below.',
    'stylus-and-touch': 'Pen, mouse, and touch can all draw on the canvas.',
  } as const;

  return (
    <section
      className={
        mobile
          ? 'rounded-xl border border-stone-200 p-3 dark:border-white/[0.08]'
          : 'rounded-lg bg-stone-100/90 p-2 dark:bg-white/[0.035]'
      }
    >
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-500 dark:text-stone-400">
        Drawing input
      </p>
      <label className="block space-y-1.5 text-sm text-stone-700 dark:text-stone-200">
        <span>Input mode</span>
        <select
          aria-label="Drawing input mode"
          value={inputMode}
          onChange={(event) => {
            // SAFETY: The select options below are the complete CanvasInputMode union.
            setInputMode(event.target.value as typeof inputMode);
          }}
          className="h-10 w-full rounded-md border border-stone-300 bg-white px-2 text-sm outline-none focus:border-amber-500 dark:border-white/[0.1] dark:bg-stone-950/30 dark:text-stone-200"
        >
          <option value="auto">Auto</option>
          <option value="stylus-only">Stylus-only</option>
          <option value="stylus-and-touch">Stylus-and-touch</option>
        </select>
      </label>
      <p className="mt-1.5 text-xs leading-5 text-stone-500 dark:text-stone-400">
        {modeHelp[inputMode]}
      </p>
      {inputMode === 'auto' && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white/70 p-2.5 dark:border-white/[0.08] dark:bg-white/[0.025]">
          <div>
            <p className="text-sm text-stone-700 dark:text-stone-200">Stylus mode</p>
            <p className="text-xs leading-5 text-stone-500 dark:text-stone-400">
              {sessionStylusSuppression ? 'Fingers will not draw.' : 'Fingers can draw.'}
            </p>
          </div>
          <Button
            type="button"
            variant={sessionStylusSuppression ? 'default' : 'secondary'}
            size="sm"
            aria-label="Stylus mode"
            aria-pressed={sessionStylusSuppression}
            onClick={() => setSessionStylusSuppression(!sessionStylusSuppression)}
          >
            {sessionStylusSuppression ? 'On' : 'Off'}
          </Button>
        </div>
      )}
      <div className="mt-3 space-y-1.5">
        <span className="text-sm text-stone-700 dark:text-stone-200">Finger behavior</span>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={fingerAction === 'pan' ? 'default' : 'secondary'}
            size="sm"
            aria-pressed={fingerAction === 'pan'}
            onClick={() => setFingerAction('pan')}
          >
            Pan
          </Button>
          <Button
            type="button"
            variant={fingerAction === 'ignore' ? 'default' : 'secondary'}
            size="sm"
            aria-pressed={fingerAction === 'ignore'}
            onClick={() => setFingerAction('ignore')}
          >
            Ignore
          </Button>
        </div>
        <p className="text-xs leading-5 text-stone-500 dark:text-stone-400">
          Pan lets fingers move the canvas. Ignore disables finger gestures.
        </p>
      </div>
    </section>
  );
}
