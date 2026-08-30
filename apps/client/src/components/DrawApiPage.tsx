import { useEffect, useState } from 'react';
import { ArrowLeft, PenTool, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { getDrawApiCounter, incrementDrawApiCounter } from '@/lib/api';

const moods = [
  { label: 'A tiny masterpiece', color: '#fcd34d', accent: '#f97316' },
  { label: 'Maximum doodle energy', color: '#86efac', accent: '#06b6d4' },
  { label: 'A very serious squiggle', color: '#f9a8d4', accent: '#8b5cf6' },
];

export function DrawApiPage() {
  const [moodIndex, setMoodIndex] = useState(0);
  const [collectiveClicks, setCollectiveClicks] = useState(0);
  const [partyMode, setPartyMode] = useState(false);
  const mood = moods[moodIndex];

  useEffect(() => {
    void getDrawApiCounter()
      .then(({ clicks }) => setCollectiveClicks(clicks))
      .catch(() => undefined);
  }, []);

  const remixDoodle = () => {
    setMoodIndex((index) => (index + 1) % moods.length);
  };

  const collectIdea = () => {
    void incrementDrawApiCounter()
      .then(({ clicks }) => setCollectiveClicks((current) => Math.max(current, clicks)))
      .catch(() => undefined);
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-stone-100 px-5 py-10 text-stone-950 dark:bg-[#151210] dark:text-stone-100">
      <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(120,113,108,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(120,113,108,0.12)_1px,transparent_1px)] [background-size:28px_28px] dark:opacity-30" />
      <div className="pointer-events-none absolute -left-20 top-10 h-72 w-72 rounded-full bg-amber-300/30 blur-3xl dark:bg-amber-400/10" />
      <div className="pointer-events-none absolute -bottom-24 -right-10 h-80 w-80 rounded-full bg-orange-300/25 blur-3xl dark:bg-orange-400/10" />

      <section className="relative w-full max-w-2xl overflow-hidden rounded-[2rem] border border-stone-300/80 bg-stone-50/85 p-6 shadow-2xl shadow-stone-900/10 backdrop-blur sm:p-10 dark:border-white/[0.12] dark:bg-[#211e1b]/90 dark:shadow-black/20">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 -rotate-6 items-center justify-center rounded-2xl bg-stone-950 text-amber-300 shadow-lg dark:bg-amber-300 dark:text-stone-950">
              <PenTool className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight">SketchFlow</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                Secret studio
              </p>
            </div>
          </div>
          <Sparkles className="h-5 w-5 animate-pulse text-amber-500" aria-hidden="true" />
        </div>

        <div className="mt-10 grid items-center gap-8 sm:grid-cols-[1fr_230px]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
              200 · SketchFlow is feeling creative
            </p>
            <h1 className="mt-3 max-w-md text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
              {mood.label}.
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-6 text-stone-600 dark:text-stone-400">
              You found the secret little corner of SketchFlow. Everything is warmed up and
              absolutely ready to make something weird.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              <Button
                onClick={remixDoodle}
                className="bg-stone-900 text-amber-100 hover:bg-stone-800 dark:bg-amber-300 dark:text-stone-950 dark:hover:bg-amber-200"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Remix the doodle
              </Button>
              <Button variant="secondary" onClick={() => setPartyMode((enabled) => !enabled)}>
                <span className="mr-2" aria-hidden="true">{partyMode ? '🪩' : '✨'}</span>
                {partyMode ? 'Quiet mode' : 'Party mode'}
              </Button>
              <Button variant="ghost" onClick={() => window.location.assign('/draw')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to canvas
              </Button>
            </div>
          </div>

          <div className={`relative mx-auto h-[230px] w-[230px] rotate-3 rounded-[2.5rem] border-2 border-stone-900 bg-white p-4 shadow-[8px_8px_0_#1c1917] transition-transform duration-500 hover:rotate-6 dark:border-amber-100 dark:bg-[#faf7ed] dark:shadow-[8px_8px_0_#fcd34d] ${partyMode ? 'animate-[card-party_1.8s_ease-in-out_infinite]' : ''}`}>
            {partyMode && (
              <>
                <span className="absolute -left-5 top-10 animate-ping text-lg" aria-hidden="true">✦</span>
                <span className="absolute -right-5 bottom-12 animate-pulse text-lg" aria-hidden="true">✺</span>
              </>
            )}
            <svg
              viewBox="0 0 200 200"
              className="h-full w-full cursor-pointer animate-[doodle-float_4s_ease-in-out_infinite]"
              role="img"
              aria-label="A playful generated doodle. Click it to collect an idea."
              onClick={collectIdea}
            >
              <path
                d="M19 111C36 74 55 78 70 105s29 61 51 46 13-65 38-83 30 17 22 40-25 51-7 67"
                fill="none"
                stroke={mood.color}
                strokeLinecap="round"
                strokeWidth="13"
                className="origin-center [transform-box:fill-box] animate-[doodle-wiggle_3s_ease-in-out_infinite]"
              />
              <path d="M32 48 48 31l16 17-16 17Z" fill={mood.accent} className="origin-center [transform-box:fill-box] animate-[sparkle-pulse_2.4s_ease-in-out_infinite]" />
              <circle cx="155" cy="43" r="14" fill={mood.color} className="origin-center [transform-box:fill-box] animate-[sparkle-pulse_2.4s_ease-in-out_0.5s_infinite]" />
              <circle cx="155" cy="43" r="5" fill="#1c1917" />
              <path d="m117 35 7-12 7 12-7 12Z" fill={mood.accent} className="origin-center [transform-box:fill-box] animate-[sparkle-pulse_2.4s_ease-in-out_1s_infinite]" />
              <path d="M42 155c14 8 25 8 37 0" fill="none" stroke="#1c1917" strokeLinecap="round" strokeWidth="5" />
            </svg>
            <span className="absolute -right-5 -top-5 rotate-12 rounded-full bg-amber-300 px-3 py-1 text-xs font-bold text-stone-950 shadow-md">
              wow!
            </span>
            <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-500 shadow-sm">
              click to collect
            </span>
          </div>
        </div>
        <div className="mt-8 flex items-center justify-between border-t border-stone-200 pt-4 text-xs text-stone-500 dark:border-white/[0.1] dark:text-stone-400">
          <span>Collective clicks: <strong className="text-stone-900 dark:text-stone-100">{collectiveClicks}</strong></span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> imagination online</span>
        </div>
      </section>
    </main>
  );
}
