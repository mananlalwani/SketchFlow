import { describe, expect, it } from 'vitest';
import { getCanvasToolShortcut, isEditableKeyboardTarget } from '@/lib/canvasKeyboard';

describe('canvas keyboard input', () => {
  it('maps supported tool shortcuts without handling unrelated keys', () => {
    expect(getCanvasToolShortcut('b')).toBe('pen');
    expect(getCanvasToolShortcut('R')).toBe('rectangle');
    expect(getCanvasToolShortcut('3')).toBe('triangle');
    expect(getCanvasToolShortcut('?')).toBeNull();
  });

  it('does not capture keyboard input from editable elements', () => {
    expect(isEditableKeyboardTarget(document.createElement('input'))).toBe(true);
    expect(isEditableKeyboardTarget(document.createElement('textarea'))).toBe(true);
    expect(isEditableKeyboardTarget(document.createElement('button'))).toBe(false);
  });
});
