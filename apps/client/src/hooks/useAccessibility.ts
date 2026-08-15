/**
 * Hook for accessibility features
 */
import { useEffect, useState } from 'react';

export interface AccessibilityPreferences {
  prefersReducedMotion: boolean;
  prefersHighContrast: boolean;
  prefersColorScheme: 'light' | 'dark' | 'no-preference';
}

export function useAccessibility() {
  const [preferences, setPreferences] = useState<AccessibilityPreferences>({
    prefersReducedMotion: false,
    prefersHighContrast: false,
    prefersColorScheme: 'no-preference',
  });

  useEffect(() => {
    // Check for reduced motion preference
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateReducedMotion = () => {
      setPreferences((prev) => ({
        ...prev,
        prefersReducedMotion: reducedMotionQuery.matches,
      }));
    };
    updateReducedMotion();
    reducedMotionQuery.addEventListener('change', updateReducedMotion);

    // Check for high contrast preference
    const highContrastQuery = window.matchMedia('(prefers-contrast: high)');
    const updateHighContrast = () => {
      setPreferences((prev) => ({
        ...prev,
        prefersHighContrast: highContrastQuery.matches,
      }));
    };
    updateHighContrast();
    highContrastQuery.addEventListener('change', updateHighContrast);

    // Check for color scheme preference
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const lightModeQuery = window.matchMedia('(prefers-color-scheme: light)');
    const updateColorScheme = () => {
      setPreferences((prev) => ({
        ...prev,
        prefersColorScheme: darkModeQuery.matches
          ? 'dark'
          : lightModeQuery.matches
            ? 'light'
            : 'no-preference',
      }));
    };
    updateColorScheme();
    darkModeQuery.addEventListener('change', updateColorScheme);
    lightModeQuery.addEventListener('change', updateColorScheme);

    return () => {
      reducedMotionQuery.removeEventListener('change', updateReducedMotion);
      highContrastQuery.removeEventListener('change', updateHighContrast);
      darkModeQuery.removeEventListener('change', updateColorScheme);
      lightModeQuery.removeEventListener('change', updateColorScheme);
    };
  }, []);

  return preferences;
}

/**
 * Hook for keyboard shortcuts
 */
export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  description: string;
  action: () => void;
  category?: string;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[], enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.contentEditable === 'true')
      ) {
        return;
      }

      const matchingShortcut = shortcuts.find((shortcut) => {
        const keyMatches = shortcut.key.toLowerCase() === e.key.toLowerCase();
        const ctrlMatches = shortcut.ctrlKey === undefined || shortcut.ctrlKey === e.ctrlKey;
        const shiftMatches = shortcut.shiftKey === undefined || shortcut.shiftKey === e.shiftKey;
        const metaMatches = shortcut.metaKey === undefined || shortcut.metaKey === e.metaKey;
        const altMatches = shortcut.altKey === undefined || shortcut.altKey === e.altKey;

        return keyMatches && ctrlMatches && shiftMatches && metaMatches && altMatches;
      });

      if (matchingShortcut) {
        e.preventDefault();
        matchingShortcut.action();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts, enabled]);
}

/**
 * Announce message to screen readers
 */
export function announceToScreenReader(
  message: string,
  priority: 'polite' | 'assertive' = 'polite',
) {
  const announcement = document.createElement('div');
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', priority);
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.textContent = message;

  document.body.appendChild(announcement);

  // Remove after announcement
  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
}

/**
 * Get accessible label for tool
 */
export function getToolLabel(tool: string, shortcut?: string): string {
  let label = tool;
  switch (tool) {
    case 'pen':
      label = 'Pen tool';
      break;
    case 'eraser':
      label = 'Eraser tool';
      break;
    case 'line':
      label = 'Line tool';
      break;
    case 'rectangle':
      label = 'Rectangle tool';
      break;
    case 'ellipse':
      label = 'Ellipse tool';
      break;
    case 'triangle':
      label = 'Triangle tool';
      break;
    case 'star':
      label = 'Star tool';
      break;
    case 'text':
      label = 'Text tool';
      break;
    case 'hand':
      label = 'Pan tool';
      break;
    case 'move':
      label = 'Move tool';
      break;
    case 'eyedropper':
      label = 'Color picker tool';
      break;
    case 'image':
      label = 'Image tool';
      break;
  }
  return shortcut ? `${label} (${shortcut})` : label;
}
