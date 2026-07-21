import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useDrawingStore } from '@/store/drawingStore';

// Mock dependencies
vi.mock('@/hooks/useSocket', () => ({
  useDrawingSocket: () => ({
    emitClear: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock('@/lib/api', () => ({
  createProject: vi.fn(),
  updateProject: vi.fn(),
  getProject: vi.fn(),
  listProjects: vi.fn().mockResolvedValue([]),
}));

// Simple toolbar component for testing core functionality
// (The real DrawingToolbar has many dependencies that are hard to mock)
function ToolbarTestComponent() {
  const { currentTool, brushSize, shapeFilled, setTool, setBrushSize, setShapeFilled } =
    useDrawingStore();

  const h = React.createElement;
  return h(
    'div',
    { 'data-testid': 'toolbar' },
    h('div', { 'data-testid': 'current-tool' }, currentTool),
    h('div', { 'data-testid': 'brush-size' }, brushSize),
    h('div', { 'data-testid': 'shape-filled' }, shapeFilled ? 'filled' : 'outline'),
    h('button', { onClick: () => setTool('pen'), 'data-testid': 'tool-pen' }, 'Pen'),
    h('button', { onClick: () => setTool('eraser'), 'data-testid': 'tool-eraser' }, 'Eraser'),
    h(
      'button',
      { onClick: () => setTool('rectangle'), 'data-testid': 'tool-rectangle' },
      'Rectangle',
    ),
    h('input', {
      type: 'range',
      value: brushSize,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setBrushSize(Number(e.target.value)),
      'data-testid': 'size-slider',
    }),
    h(
      'button',
      { onClick: () => setShapeFilled(!shapeFilled), 'data-testid': 'toggle-fill' },
      'Toggle Fill',
    ),
  );
}

describe('DrawingToolbar (simplified)', () => {
  beforeEach(() => {
    // Reset store
    useDrawingStore.setState({
      currentTool: 'pen',
      brushSize: 4,
      shapeFilled: false,
    });
  });

  it('should render with initial state', () => {
    render(React.createElement(ToolbarTestComponent));

    expect(screen.getByTestId('current-tool')).toHaveTextContent('pen');
    expect(screen.getByTestId('brush-size')).toHaveTextContent('4');
    expect(screen.getByTestId('shape-filled')).toHaveTextContent('outline');
  });

  it('should change tool when clicked', () => {
    render(React.createElement(ToolbarTestComponent));

    fireEvent.click(screen.getByTestId('tool-eraser'));
    expect(screen.getByTestId('current-tool')).toHaveTextContent('eraser');

    fireEvent.click(screen.getByTestId('tool-rectangle'));
    expect(screen.getByTestId('current-tool')).toHaveTextContent('rectangle');
  });

  it('should toggle fill state', () => {
    render(React.createElement(ToolbarTestComponent));

    expect(screen.getByTestId('shape-filled')).toHaveTextContent('outline');

    fireEvent.click(screen.getByTestId('toggle-fill'));
    expect(screen.getByTestId('shape-filled')).toHaveTextContent('filled');

    fireEvent.click(screen.getByTestId('toggle-fill'));
    expect(screen.getByTestId('shape-filled')).toHaveTextContent('outline');
  });

  it('should update brush size', () => {
    render(React.createElement(ToolbarTestComponent));

    const slider = screen.getByTestId('size-slider');
    fireEvent.change(slider, { target: { value: '20' } });

    expect(screen.getByTestId('brush-size')).toHaveTextContent('20');
  });

  it('should sync state with Zustand store', () => {
    render(React.createElement(ToolbarTestComponent));

    // Change state via store directly, wrapped in act()
    act(() => {
      useDrawingStore.getState().setTool('line');
      useDrawingStore.getState().setBrushSize(50);
    });

    // Store should reflect the change
    expect(useDrawingStore.getState().currentTool).toBe('line');
    expect(useDrawingStore.getState().brushSize).toBe(50);
  });
});

describe('Toolbar tool list', () => {
  const tools = [
    'hand',
    'move',
    'pen',
    'eraser',
    'line',
    'rectangle',
    'ellipse',
    'triangle',
    'text',
  ] as const;

  it('should have all expected tools', () => {
    // Just verify the tool types are valid
    tools.forEach((tool) => {
      useDrawingStore.getState().setTool(tool);
      expect(useDrawingStore.getState().currentTool).toBe(tool);
    });
  });
});
