import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { InputSettingsSection } from '@/components/SettingsDropdown';
import { useDrawingStore } from '@/store/drawingStore';

describe('InputSettingsSection', () => {
  beforeEach(() => {
    useDrawingStore.setState({ inputMode: 'auto', fingerAction: 'pan' });
  });

  it('describes and persists the selected input mode', () => {
    render(<InputSettingsSection />);

    const inputMode = screen.getByRole('combobox', { name: 'Drawing input mode' });
    fireEvent.change(inputMode, { target: { value: 'stylus-only' } });

    expect(useDrawingStore.getState().inputMode).toBe('stylus-only');
    expect(screen.getByText(/Only a pen or mouse draws/)).toBeInTheDocument();
  });

  it('exposes finger pan and ignore as pressed choices', () => {
    render(<InputSettingsSection mobile />);

    const ignore = screen.getByRole('button', { name: 'Ignore' });
    fireEvent.click(ignore);

    expect(useDrawingStore.getState().fingerAction).toBe('ignore');
    expect(ignore).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Pan' })).toHaveAttribute('aria-pressed', 'false');
  });
});
