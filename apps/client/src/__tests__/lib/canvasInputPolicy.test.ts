import { describe, expect, it } from 'vitest';
import {
  canPointerDraw,
  canPointerPan,
  createPointerPolicyState,
  interruptPointers,
  isStylusInput,
  observePointerDown,
  releasePointer,
  shouldSuppressTouch,
} from '@/lib/canvasInputPolicy';

const autoPan = { inputMode: 'auto' as const, fingerAction: 'pan' as const };
const autoIgnore = { inputMode: 'auto' as const, fingerAction: 'ignore' as const };

describe('canvas input policy', () => {
  it('keeps mouse drawing in every mode', () => {
    for (const inputMode of ['auto', 'stylus-only', 'stylus-and-touch'] as const) {
      const state = createPointerPolicyState();
      expect(
        canPointerDraw({ inputMode, fingerAction: 'ignore' }, state, { pointerType: 'mouse' }),
      ).toBe(true);
    }
  });

  it('allows touch drawing in auto mode until a pen is observed this session', () => {
    const state = createPointerPolicyState();
    const touch = { pointerType: 'touch', pointerId: 1 };
    expect(canPointerDraw(autoPan, state, touch)).toBe(true);
    observePointerDown(state, { pointerType: 'pen', pointerId: 2 });
    expect(canPointerDraw(autoPan, state, touch)).toBe(false);
    releasePointer(state, { pointerType: 'pen', pointerId: 2 });
    expect(canPointerPan(autoPan, state, touch)).toBe(true);
    expect(shouldSuppressTouch(autoPan, state, touch)).toBe(true);
  });

  it('keeps touch drawing enabled in stylus-and-touch mode', () => {
    const state = createPointerPolicyState();
    const preferences = { inputMode: 'stylus-and-touch' as const, fingerAction: 'ignore' as const };
    expect(canPointerDraw(preferences, state, { pointerType: 'touch' })).toBe(true);
    expect(shouldSuppressTouch(preferences, state, { pointerType: 'touch' })).toBe(false);
  });

  it('allows finger pan or ignore after stylus-only admission is selected', () => {
    const state = createPointerPolicyState();
    const touch = { pointerType: 'touch' };
    expect(canPointerDraw({ inputMode: 'stylus-only', fingerAction: 'pan' }, state, touch)).toBe(
      false,
    );
    expect(canPointerPan({ inputMode: 'stylus-only', fingerAction: 'pan' }, state, touch)).toBe(
      true,
    );
    expect(canPointerPan({ inputMode: 'stylus-only', fingerAction: 'ignore' }, state, touch)).toBe(
      false,
    );
    expect(
      shouldSuppressTouch({ inputMode: 'stylus-only', fingerAction: 'ignore' }, state, touch),
    ).toBe(true);
  });

  it('suppresses touch while any pen pointer is active without affecting the pen', () => {
    const state = createPointerPolicyState();
    observePointerDown(state, { pointerType: 'pen', pointerId: 10 });
    expect(canPointerDraw(autoPan, state, { pointerType: 'touch', pointerId: 11 })).toBe(false);
    expect(canPointerPan(autoPan, state, { pointerType: 'touch', pointerId: 11 })).toBe(false);
    expect(canPointerDraw(autoPan, state, { pointerType: 'pen', pointerId: 10 })).toBe(true);
    releasePointer(state, { pointerType: 'pen', pointerId: 10 });
    expect(canPointerPan(autoPan, state, { pointerType: 'touch', pointerId: 11 })).toBe(true);
  });

  it('keeps touch suppressed until every active pen pointer is released', () => {
    const state = createPointerPolicyState();
    observePointerDown(state, { pointerType: 'pen', pointerId: 20 });
    observePointerDown(state, { pointerType: 'pen', pointerId: 21 });

    releasePointer(state, { pointerType: 'pen', pointerId: 20 });
    expect(state.activePenPointers).toEqual(new Set([21]));
    expect(canPointerPan(autoPan, state, { pointerType: 'touch' })).toBe(false);

    releasePointer(state, { pointerType: 'pen', pointerId: 21 });
    expect(state.activePenPointers).toEqual(new Set());
    expect(canPointerPan(autoPan, state, { pointerType: 'touch' })).toBe(true);
  });

  it('preserves two-finger pan and pinch admission', () => {
    const state = createPointerPolicyState();
    const touch = { pointerType: 'touch', touches: 2 };
    expect(canPointerDraw(autoPan, state, touch)).toBe(false);
    expect(canPointerPan(autoPan, state, touch)).toBe(true);
    expect(shouldSuppressTouch(autoPan, state, touch)).toBe(true);
  });

  it('cleans active pen state on cancel or interrupted gestures', () => {
    const state = createPointerPolicyState();
    observePointerDown(state, { pointerType: 'pen', pointerId: 7 });
    releasePointer(state, { pointerType: 'pen', pointerId: 7 });
    expect(canPointerPan(autoIgnore, state, { pointerType: 'touch' })).toBe(false);

    observePointerDown(state, { pointerType: 'pen', pointerId: 8 });
    interruptPointers(state);
    expect(canPointerPan(autoIgnore, state, { pointerType: 'touch' })).toBe(false);
    expect(state.activePenPointers.size).toBe(0);
  });

  it('admits a fresh pen after the previous pen is cancelled', () => {
    const state = createPointerPolicyState();
    observePointerDown(state, { pointerType: 'pen', pointerId: 30 });
    releasePointer(state, { pointerType: 'pen', pointerId: 30 });

    observePointerDown(state, { pointerType: 'pen', pointerId: 31 });
    expect(canPointerDraw(autoPan, state, { pointerType: 'pen', pointerId: 31 })).toBe(true);
    expect(state.activePenPointers).toEqual(new Set([31]));
  });

  it('recognizes only pen as stylus input', () => {
    expect(isStylusInput({ pointerType: 'pen' })).toBe(true);
    expect(isStylusInput({ pointerType: 'mouse' })).toBe(false);
    expect(isStylusInput({ pointerType: 'touch' })).toBe(false);
  });
});
