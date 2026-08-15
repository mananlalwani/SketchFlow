export type CanvasToolShortcut =
  | 'hand'
  | 'pen'
  | 'eraser'
  | 'line'
  | 'rectangle'
  | 'ellipse'
  | 'text'
  | 'eyedropper'
  | 'triangle';

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  return Boolean(
    target instanceof HTMLElement &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable),
  );
}

export function getCanvasToolShortcut(key: string): CanvasToolShortcut | null {
  switch (key.toLowerCase()) {
    case 'v':
    case 'h':
      return 'hand';
    case 'p':
    case 'b':
      return 'pen';
    case 'e':
      return 'eraser';
    case 'l':
      return 'line';
    case 'r':
      return 'rectangle';
    case 'c':
    case 'o':
      return 'ellipse';
    case 't':
      return 'text';
    case 'i':
      return 'eyedropper';
    case '3':
      return 'triangle';
    default:
      return null;
  }
}
