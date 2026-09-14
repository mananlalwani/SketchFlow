# Canvas structure

The board is a retained object list in Zustand (`objects`). The visible canvas is a worker (OffscreenCanvas) with a main-thread fallback. Pointer code does not draw pixels; it plans mutations, then the presentation layer sends scene commands.

## Layers

| Layer | Role |
| --- | --- |
| `DrawingCanvas.tsx` | Store, overlays, collaboration, renderer, text, keyboard. No hit-testing. |
| `useCanvasDrawingSession` | Applies tool plans: select, ink, shapes, erase, text. Owns live stroke/drag state. |
| `useCanvasGestureBindings` | Pointer capture, cancel/lost-capture, blur interrupt, `useGesture` pan/pinch/wheel. |
| `useCanvasRendererRuntime` | Worker, presentation, scene reload, initial centered view. |
| `lib/canvas*Gesture.ts`, `canvasStrokeCommit.ts`, `canvasLiveStroke.ts` | Pure plans. Unit-test these; do not assert pixels. |

## Plans vs apply

`plan*` / `preview*` / `strokeCommitSteps` return data. Hooks apply them (history, `addObject`, `presentation.send`). If a rule can be decided without React, it belongs in `lib/`.

## Input

Touch vs stylus policy is `canvasInputPolicy.ts`. Select/marquee/drag is `canvasSelectGesture.ts`. Ink/shapes/object-erase/custom triangle is `canvasDrawGesture.ts`. Drag-vs-pan routing is `canvasGesturePlan.ts`.

## Collaboration

Local `objects` update first. Commits are idempotent socket operations and stay queued on ack failure. Semantics: [ADR 0001](adr/0001-server-ordered-collaboration.md).
