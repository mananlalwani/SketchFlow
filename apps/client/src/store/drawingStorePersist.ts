import { FEATURES } from '../config/features';
import type { DrawingState } from './drawingStoreTypes';

type DrawingStorePersistedState = Partial<{
  customColors: string[];
  brushSize: number;
  textFontSize: number;
  brushColor: string;
  brushOpacity: number;
  penSize: number;
  penColor: string;
  penOpacity: number;
  highlighterSize: number;
  highlighterColor: string;
  highlighterOpacity: number;
  currentTool: DrawingState['currentTool'];
  eraserMode: DrawingState['eraserMode'];
  projectTitle: string;
  drawingFilled: boolean;
  inputMode: DrawingState['inputMode'];
  fingerAction: DrawingState['fingerAction'];
  autoDrawing: boolean;
  autoDrawingThresholds: DrawingState['autoDrawingThresholds'];
}>;

export const drawingStorePersistOptions = {
  name: 'drawing-store',
  version: 2,
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Zustand persist supplies untyped localStorage JSON; this migrate function is the parser.
  migrate: (persistedState: unknown, version: number) => {
    // SAFETY: persist payloads are JSON objects; missing keys stay optional on DrawingStorePersistedState.
    const state = persistedState as DrawingStorePersistedState;
    if (version >= 2) return state;
    return {
      ...state,
      penSize: state.penSize ?? state.brushSize ?? 4,
      penColor: state.penColor ?? state.brushColor ?? '#ffffff',
      penOpacity: state.penOpacity ?? state.brushOpacity ?? 1,
      highlighterSize: state.highlighterSize ?? 18,
      highlighterColor: state.highlighterColor ?? '#facc15',
      highlighterOpacity: state.highlighterOpacity ?? 0.35,
    };
  },
  partialize: (state: DrawingState) => {
    const base = {
      customColors: state.customColors,
      brushSize: state.brushSize,
      textFontSize: state.textFontSize,
      brushColor: state.brushColor,
      brushOpacity: state.brushOpacity,
      penSize: state.penSize,
      penColor: state.penColor,
      penOpacity: state.penOpacity,
      highlighterSize: state.highlighterSize,
      highlighterColor: state.highlighterColor,
      highlighterOpacity: state.highlighterOpacity,
      currentTool: state.currentTool,
      eraserMode: state.eraserMode,
      projectTitle: state.projectTitle,
      drawingFilled: state.drawingFilled,
      inputMode: state.inputMode,
      fingerAction: state.fingerAction,
    };
    if (FEATURES.AUTO_DRAWING) {
      return {
        ...base,
        autoDrawing: state.autoDrawing,
        autoDrawingThresholds: state.autoDrawingThresholds,
      };
    }
    return base;
  },
};
