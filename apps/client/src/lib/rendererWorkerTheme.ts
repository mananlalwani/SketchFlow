/** Theme contrast and eraser-background remapping for the offscreen renderer. */

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  // Handle shorthand hex
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, (_, r, g, b) => r + r + g + g + b + b);

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((x) => {
        const hex = Math.round(Math.max(0, Math.min(255, x))).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      })
      .join('')
  );
}

export function getLuminance(r: number, g: number, b: number): number {
  // Relative luminance formula
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// Known background colors that should never be adjusted - eraser strokes use these
// Must match BG_COLORS in DrawingCanvas.tsx
const BG_COLORS = ['#020617', '#f8fafc', '#0a0a0a', '#e0e0e0'];

export function isBackgroundColor(color: string): boolean {
  const normalized = color.toLowerCase();
  return BG_COLORS.includes(normalized);
}

export function adjustColorForTheme(color: string, canvasBgColor: string, isLightMode: boolean): string {
  // Always convert eraser/background strokes to current background color
  // This ensures eraser strokes from saved projects (which may have used a different theme's background)
  // always match the current theme's background
  const normalizedColor = color.toLowerCase();
  if (isBackgroundColor(normalizedColor)) {
    return canvasBgColor;
  }

  // If we're in dark mode, no adjustment needed (colors drawn as-is)
  if (!isLightMode) return color;

  // Handle rgba colors
  const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1]);
    const g = parseInt(rgbaMatch[2]);
    const b = parseInt(rgbaMatch[3]);
    const a = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1;

    const luminance = getLuminance(r, g, b);

    // Invert colors based on luminance for light mode
    // High luminance colors (light colors like white) become dark
    // Low luminance colors (dark colors like black) become light
    if (luminance > 0.7) {
      // Light color -> make it dark
      const factor = 1 - luminance;
      const newR = Math.round(r * factor * 0.3);
      const newG = Math.round(g * factor * 0.3);
      const newB = Math.round(b * factor * 0.3);
      return a < 1 ? `rgba(${newR}, ${newG}, ${newB}, ${a})` : `rgb(${newR}, ${newG}, ${newB})`;
    } else if (luminance < 0.15) {
      // Very dark color -> make it lighter but not too light
      const newR = Math.min(255, r + 180);
      const newG = Math.min(255, g + 180);
      const newB = Math.min(255, b + 180);
      return a < 1 ? `rgba(${newR}, ${newG}, ${newB}, ${a})` : `rgb(${newR}, ${newG}, ${newB})`;
    }

    return color;
  }

  // Handle hex colors
  const rgb = hexToRgb(color);
  if (!rgb) return color;

  const luminance = getLuminance(rgb.r, rgb.g, rgb.b);

  // Invert based on luminance
  if (luminance > 0.7) {
    // Light color -> make it dark (invert)
    const factor = 1 - luminance;
    return rgbToHex(
      Math.round(rgb.r * factor * 0.3),
      Math.round(rgb.g * factor * 0.3),
      Math.round(rgb.b * factor * 0.3),
    );
  } else if (luminance < 0.15) {
    // Very dark color -> make it lighter
    return rgbToHex(
      Math.min(255, rgb.r + 180),
      Math.min(255, rgb.g + 180),
      Math.min(255, rgb.b + 180),
    );
  }

  // Mid-range colors: slight adjustment for better contrast
  if (luminance > 0.4 && luminance <= 0.7) {
    // Slightly darken mid-light colors
    return rgbToHex(Math.round(rgb.r * 0.7), Math.round(rgb.g * 0.7), Math.round(rgb.b * 0.7));
  }

  return color;
}
