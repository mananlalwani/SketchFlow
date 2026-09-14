import type { RefObject } from 'react';
import { Button } from './ui/button';

interface CanvasTextComposerProps {
  isMobile: boolean;
  textInputPos: { x: number; y: number };
  textInputRef: RefObject<HTMLTextAreaElement | null>;
  textInputValue: string;
  textFontSize: number;
  brushColor: string;
  setTextInputValue: (value: string) => void;
  setTextFontSize: (size: number) => void;
  clearTextInput: () => void;
  submitTextInput: () => void;
}

function FontSizeControls({
  textFontSize,
  setTextFontSize,
  compact,
}: {
  textFontSize: number;
  setTextFontSize: (size: number) => void;
  compact?: boolean;
}) {
  const buttonClass = compact ? 'h-7 w-7' : 'h-8 w-8 text-base';
  const inputClass = compact
    ? 'w-8 bg-transparent text-right font-mono text-[11px] tabular-nums text-stone-700 outline-none dark:text-stone-200'
    : 'w-9 bg-transparent text-right font-mono text-xs tabular-nums text-stone-700 outline-none dark:text-stone-200';
  return (
    <div
      className={
        compact
          ? 'flex items-center rounded-md border border-stone-200 bg-white dark:border-white/[0.1] dark:bg-white/[0.04]'
          : 'flex items-center gap-1 rounded-lg border border-stone-200 bg-white p-1 dark:border-white/[0.1] dark:bg-white/[0.04]'
      }
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={buttonClass}
        aria-label="Decrease text size"
        onClick={() => setTextFontSize(textFontSize - 2)}
      >
        −
      </Button>
      <label
        className={
          compact
            ? 'flex h-7 items-center border-x border-stone-200 pl-1.5 dark:border-white/[0.1]'
            : 'flex h-8 items-center border-x border-stone-200 pl-2 dark:border-white/[0.1]'
        }
      >
        <input
          type="number"
          inputMode="numeric"
          min="12"
          max="240"
          value={textFontSize}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (Number.isFinite(value)) setTextFontSize(value);
          }}
          className={inputClass}
          aria-label="Text font size in pixels"
        />
        <span className={compact ? 'px-1 text-[10px] text-stone-500' : 'px-1.5 text-xs text-stone-500'}>
          px
        </span>
      </label>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={buttonClass}
        aria-label="Increase text size"
        onClick={() => setTextFontSize(textFontSize + 2)}
      >
        +
      </Button>
    </div>
  );
}

export function CanvasTextComposer({
  isMobile,
  textInputPos,
  textInputRef,
  textInputValue,
  textFontSize,
  brushColor,
  setTextInputValue,
  setTextFontSize,
  clearTextInput,
  submitTextInput,
}: CanvasTextComposerProps) {
  const presets = (
    <div className={isMobile ? 'mb-3 flex gap-2' : 'mt-2 flex gap-1.5'} aria-label="Text size presets">
      {[16, 24, 32, 48].map((size) => (
        <Button
          key={size}
          type="button"
          variant={textFontSize === size ? 'default' : 'secondary'}
          size="sm"
          className={isMobile ? 'h-8 min-w-11 px-2 font-mono text-xs' : 'h-6 min-w-9 px-1.5 font-mono text-[10px]'}
          onClick={() => setTextFontSize(size)}
        >
          {size}
        </Button>
      ))}
    </div>
  );

  if (isMobile) {
    return (
      <div
        className="fixed inset-x-0 bottom-0 z-[10000] border-t border-stone-200 bg-stone-50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_rgba(28,25,23,0.18)] dark:border-white/[0.1] dark:bg-[#211e1b] dark:shadow-black/45"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-stone-300 dark:bg-white/20" />
        <div className="mx-auto max-w-lg">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500 dark:text-stone-400">
              Add text
            </span>
            <FontSizeControls textFontSize={textFontSize} setTextFontSize={setTextFontSize} />
          </div>
          {presets}
          <textarea
            ref={textInputRef}
            value={textInputValue}
            onChange={(e) => {
              setTextInputValue(e.target.value);
              e.currentTarget.style.height = 'auto';
              e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 176)}px`;
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') {
                e.preventDefault();
                clearTextInput();
              }
            }}
            autoFocus
            aria-label="Text to add to the canvas"
            placeholder="Type your note"
            className="min-h-[104px] w-full resize-none rounded-xl border border-stone-200 bg-white px-3 py-3 leading-[1.4] text-stone-900 outline-none placeholder:text-stone-400 focus:border-amber-500 dark:border-white/[0.1] dark:bg-stone-950/30 dark:text-stone-100 dark:placeholder:text-stone-600 dark:focus:border-amber-300"
            style={{ fontSize: '20px', color: brushColor }}
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="ghost" className="h-11" onClick={clearTextInput}>
              Cancel
            </Button>
            <Button
              className="h-11 bg-stone-900 text-amber-100 hover:bg-stone-800 dark:bg-amber-300 dark:text-stone-950 dark:hover:bg-amber-200"
              onClick={submitTextInput}
              disabled={!textInputValue.trim()}
            >
              Place text
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed z-[10000] w-[min(520px,calc(100vw-24px))] overflow-hidden rounded-xl border border-stone-200 bg-stone-50 shadow-xl shadow-stone-950/20 dark:border-white/[0.1] dark:bg-[#211e1b] dark:shadow-black/40"
      style={{ left: textInputPos.x, top: textInputPos.y }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="border-b border-stone-200 bg-stone-100/80 px-3 py-2 dark:border-white/[0.08] dark:bg-white/[0.025]">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500 dark:text-stone-400">
            <span className="h-2 w-2 rounded-full bg-amber-400 dark:bg-amber-300" />
            Text
          </span>
          <FontSizeControls compact textFontSize={textFontSize} setTextFontSize={setTextFontSize} />
        </div>
        {presets}
      </div>
      <textarea
        ref={textInputRef}
        value={textInputValue}
        onChange={(e) => {
          setTextInputValue(e.target.value);
          e.currentTarget.style.height = 'auto';
          const availableHeight = Math.max(112, window.innerHeight - textInputPos.y - 92);
          e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, availableHeight)}px`;
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submitTextInput();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            clearTextInput();
          }
        }}
        autoFocus
        aria-label="Text to add to the canvas"
        aria-describedby="text-entry-hint"
        placeholder="Write a note…"
        className="min-h-[112px] w-full resize-none overflow-y-auto bg-transparent px-3 py-3 leading-[1.4] text-stone-900 outline-none placeholder:text-stone-400 dark:text-stone-100 dark:placeholder:text-stone-600"
        style={{ fontSize: `${textFontSize}px`, color: brushColor }}
      />
      <div className="flex items-center justify-between gap-2 border-t border-stone-200 bg-stone-100/50 px-3 py-2.5 dark:border-white/[0.08] dark:bg-white/[0.02]">
        <span id="text-entry-hint" className="text-[11px] text-stone-500 dark:text-stone-400">
          ⌘/Ctrl+Enter to place
        </span>
        <div className="flex shrink-0 gap-1.5">
          <Button size="sm" variant="ghost" onClick={clearTextInput}>
            Discard
          </Button>
          <Button
            size="sm"
            className="bg-stone-900 text-amber-100 hover:bg-stone-800 dark:bg-amber-300 dark:text-stone-950 dark:hover:bg-amber-200"
            onClick={submitTextInput}
            disabled={!textInputValue.trim()}
          >
            Place text
          </Button>
        </div>
      </div>
    </div>
  );
}
