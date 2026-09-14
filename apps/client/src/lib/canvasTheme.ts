export const CANVAS_BG_COLORS = {
  dark: '#0a0a0a',
  light: '#e0e0e0',
} as const;

export type CanvasThemeName = keyof typeof CANVAS_BG_COLORS;
