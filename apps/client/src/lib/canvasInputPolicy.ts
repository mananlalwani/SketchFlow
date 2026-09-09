export type CanvasInputMode = 'auto' | 'stylus-only' | 'stylus-and-touch';
export type FingerAction = 'pan' | 'ignore';

export interface PointerPolicyState {
  stylusDetected: boolean;
  activePenPointers: Set<number>;
}

export interface PointerPolicyInput {
  pointerType: string;
  pointerId?: number;
  touches?: number;
}

export interface CanvasInputPreferences {
  inputMode: CanvasInputMode;
  fingerAction: FingerAction;
  /** Session-only override used by Auto mode after a pen is observed. */
  sessionStylusSuppression?: boolean;
}

export function createPointerPolicyState(): PointerPolicyState {
  return {
    stylusDetected: false,
    activePenPointers: new Set<number>(),
  };
}

export function isStylusInput(input: Pick<PointerPolicyInput, 'pointerType'>): boolean {
  return input.pointerType === 'pen';
}

export function isTouchInput(input: Pick<PointerPolicyInput, 'pointerType'>): boolean {
  return input.pointerType === 'touch';
}

export function observePointerDown(state: PointerPolicyState, input: PointerPolicyInput): void {
  if (!isStylusInput(input)) return;
  state.stylusDetected = true;
  state.activePenPointers.add(input.pointerId ?? -1);
}

export function releasePointer(state: PointerPolicyState, input: PointerPolicyInput): void {
  if (!isStylusInput(input)) return;
  state.activePenPointers.delete(input.pointerId ?? -1);
}

export function interruptPointers(state: PointerPolicyState): void {
  state.activePenPointers.clear();
}

function hasActivePen(state: PointerPolicyState): boolean {
  return state.activePenPointers.size > 0;
}

function isMultiTouch(input: PointerPolicyInput): boolean {
  return isTouchInput(input) && (input.touches ?? 1) > 1;
}

function stylusSuppressionEnabled(
  preferences: CanvasInputPreferences,
  state: PointerPolicyState,
): boolean {
  if (preferences.inputMode === 'stylus-only') return true;
  if (preferences.inputMode === 'stylus-and-touch') return false;
  return preferences.sessionStylusSuppression ?? state.stylusDetected;
}

/** Returns true when a touch contact must not create or manipulate canvas content. */
export function shouldSuppressTouch(
  preferences: CanvasInputPreferences,
  state: PointerPolicyState,
  input: PointerPolicyInput,
): boolean {
  if (!isTouchInput(input)) return false;
  if (hasActivePen(state) || isMultiTouch(input)) return true;
  return stylusSuppressionEnabled(preferences, state);
}

export function canPointerDraw(
  preferences: CanvasInputPreferences,
  state: PointerPolicyState,
  input: PointerPolicyInput,
): boolean {
  if (isMultiTouch(input) || (hasActivePen(state) && isTouchInput(input))) return false;
  if (input.pointerType === 'mouse' || isStylusInput(input)) return true;
  if (!isTouchInput(input)) return false;
  return !stylusSuppressionEnabled(preferences, state);
}

export function canPointerPan(
  preferences: CanvasInputPreferences,
  state: PointerPolicyState,
  input: PointerPolicyInput,
): boolean {
  if (hasActivePen(state) && isTouchInput(input)) return false;
  if (isMultiTouch(input)) return true;
  if (!isTouchInput(input)) return true;
  if (canPointerDraw(preferences, state, input)) return false;
  return preferences.fingerAction === 'pan';
}
