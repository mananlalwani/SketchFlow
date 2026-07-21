import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WelcomeTutorial } from '@/components/WelcomeTutorial';

describe('WelcomeTutorial accessibility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(localStorage.getItem).mockReturnValue(null);
  });

  afterEach(() => vi.useRealTimers());

  it('exposes keyboard-accessible tutorial controls and completion state', () => {
    const onComplete = vi.fn();
    render(<WelcomeTutorial onComplete={onComplete} />);
    act(() => vi.advanceTimersByTime(500));

    expect(screen.getByRole('button', { name: 'Close tutorial' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Skip tutorial' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Go to step 1' })).toHaveAttribute('aria-current', 'step');

    fireEvent.click(screen.getByRole('button', { name: 'Skip tutorial' }));
    expect(localStorage.setItem).toHaveBeenCalledWith('sketchflow-tutorial-completed', 'true');
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
