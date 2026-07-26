import { AlertTriangle, ArrowLeft, Compass, PenLine, PenTool, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';

type AppStateKind = 'error' | 'not-found' | 'loading';

interface AppStatePageProps {
  kind: AppStateKind;
  onRetry?: () => void;
}

const content = {
  error: {
    eyebrow: 'Canvas interrupted',
    title: 'This page lost its line.',
    description:
      'Your browser can safely reload SketchFlow. If you were working offline, local changes remain on this device.',
    Icon: AlertTriangle,
  },
  'not-found': {
    eyebrow: '404 · Wrong turn',
    title: 'Nothing is drawn here.',
    description:
      'That address does not point to a SketchFlow project. Head back to your boards and keep creating.',
    Icon: Compass,
  },
  loading: {
    eyebrow: 'Opening canvas',
    title: 'Preparing your workspace.',
    description: 'Loading the drawing tools and your local workspace.',
    Icon: PenLine,
  },
} as const;

export function AppStatePage({ kind, onRetry }: AppStatePageProps) {
  const { eyebrow, title, description, Icon } = content[kind];

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-stone-100 px-5 py-8 text-stone-950 dark:bg-[#151210] dark:text-stone-100">
      <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(120,113,108,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(120,113,108,0.12)_1px,transparent_1px)] [background-size:28px_28px] dark:opacity-30" />
      <div className="pointer-events-none absolute -right-20 top-12 h-72 w-72 rounded-full bg-amber-300/25 blur-3xl dark:bg-amber-400/10" />
      <section className="relative w-full max-w-xl border-y border-stone-300/90 py-7 dark:border-white/[0.12] sm:py-10">
        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-stone-950 text-amber-300 shadow-lg shadow-stone-950/15 dark:bg-amber-300 dark:text-stone-950">
            <PenTool className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight">SketchFlow</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-500">
              Canvas
            </p>
          </div>
        </div>
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.17em] text-amber-700 dark:text-amber-300">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {eyebrow}
        </div>
        <h1 className="max-w-lg text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">{title}</h1>
        <p className="mt-4 max-w-md text-sm leading-6 text-stone-600 dark:text-stone-400">
          {description}
        </p>
        {kind !== 'loading' && (
          <div className="mt-8 flex flex-wrap gap-2">
            {kind === 'error' && onRetry && (
              <Button variant="secondary" onClick={onRetry} className="h-10">
                <RefreshCw className="mr-2 h-4 w-4" />
                Try again
              </Button>
            )}
            <Button
              onClick={() => window.location.assign('/draw')}
              className="h-10 bg-stone-900 text-amber-100 hover:bg-stone-800 dark:bg-amber-300 dark:text-stone-950 dark:hover:bg-amber-200"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to projects
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
