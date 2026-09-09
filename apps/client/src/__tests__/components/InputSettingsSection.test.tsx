import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { InputSettingsSection } from '@/components/SettingsDropdown';
import { useDrawingStore } from '@/store/drawingStore';

describe('InputSettingsSection', () => {
  beforeEach(() => {
    useDrawingStore.setState({
      inputMode: 'auto',
      fingerAction: 'pan',
      sessionStylusSuppression: false,
    });
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

  it('offers a session-only stylus mode toggle in Auto without changing the saved input mode', () => {
    useDrawingStore.setState({ sessionStylusSuppression: true });
    render(<InputSettingsSection />);

    const stylusMode = screen.getByRole('button', { name: 'Stylus mode' });
    expect(stylusMode).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(stylusMode);

    expect(useDrawingStore.getState().sessionStylusSuppression).toBe(false);
    expect(useDrawingStore.getState().inputMode).toBe('auto');
    expect(stylusMode).toHaveAttribute('aria-pressed', 'false');
  });

  it('does not show a misleading session toggle for explicit input modes', () => {
    useDrawingStore.setState({ inputMode: 'stylus-only', sessionStylusSuppression: false });
    const { unmount } = render(<InputSettingsSection />);
    expect(screen.queryByRole('button', { name: 'Stylus mode' })).not.toBeInTheDocument();
    unmount();

    useDrawingStore.setState({ inputMode: 'stylus-and-touch' });
    render(<InputSettingsSection />);
    expect(screen.queryByRole('button', { name: 'Stylus mode' })).not.toBeInTheDocument();
  });
});
