import { useCallback, useMemo, useRef, useState } from 'react';
import { useDrawingStore } from '@/store/drawingStore';
import { useDrawingSocket } from '@/hooks/useSocket';
import { useTheme } from '@/contexts/ThemeContext';
import { ShortcutsDialog } from './ShortcutsDialog';
import { LiveCursors } from './LiveCursors';
import { CanvasTextComposer } from './CanvasTextComposer';
import { CanvasSelectionOverlays } from './CanvasSelectionOverlays';
import { useLiveCursors } from '@/hooks/useLiveCursors';
import { useLiveSelections } from '@/hooks/useLiveSelections';
import { useProjectPermissions } from '@/hooks/useProjectPermissions';
import { useCanvasToolReset } from '@/hooks/useCanvasToolReset';
import { useCanvasKeyboardShortcuts } from '@/hooks/useCanvasKeyboardShortcuts';
import { useCanvasCollaborationAdapter } from '@/hooks/useCanvasCollaborationAdapter';
import { useCanvasImageInput } from '@/hooks/useCanvasImageInput';
import { CanvasConstraintToggle } from './CanvasConstraintToggle';
import { useCanvasViewportSession } from '@/hooks/useCanvasViewportSession';
import { useCanvasTextInput } from '@/hooks/useCanvasTextInput';
import {
  useCanvasTransformHandles,
  type ActiveTransform,
} from '@/hooks/useCanvasTransformHandles';
import { planDeleteSelection } from '@/lib/canvasSelectGesture';
import { selectionOverlayModel } from '@/lib/canvasSelectionOverlay';
import { useMobile } from '@/hooks/useMobile';
import { useCanvasCollaborationSync } from '@/hooks/useCanvasCollaborationSync';
import { useToast } from '@/hooks/use-toast';
import { useCanvasRendererRuntime } from '@/hooks/useCanvasRendererRuntime';
import { useCanvasDrawingSession } from '@/hooks/useCanvasDrawingSession';
import { CanvasZoomControls } from './CanvasZoomControls';
import { CanvasShapePreview } from './CanvasShapePreview';

export function DrawingCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const {
    currentTool,
    textFontSize,
    setTextFontSize,
    brushColor,
    brushSize,
    brushOpacity,
    triangleMode,
    starPoints,
    zoom,
    viewX,
    viewY,
    objects,
    needsFullRedraw,
    clearFullRedraw,
    requestFullRedraw,
    addObject,
    setObjects,
    applyAuthoritativeProject,
    replaceHistory,
    saveHistory,
    currentProjectId,
    projectRevision,
    projectTitle,
    documentVersion,
    unsavedChanges,
    setZoom,
    setView,
    resetView,
    objectCount,
    selectedObjectId,
    setSelectedObject,
    selectedObjectIds,
    projectRole,
    updateObject,
  } = useDrawingStore();

  const [activeTransform, setActiveTransform] = useState<ActiveTransform | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedObject = useMemo(
    () => objects.find((object) => object.id === selectedObjectId),
    [objects, selectedObjectId],
  );
  const selectedObjects = useMemo(
    () =>
      selectedObjectIds.length === 0
        ? []
        : objects.filter((object) => selectedObjectIds.includes(object.id)),
    [objects, selectedObjectIds],
  );

  const { requestCanonicalHydration, commitCollaboration, isConnected, on } = useDrawingSocket();
  const { cursors, emitCursor } = useLiveCursors(currentProjectId ?? null);
  const { remoteSelections } = useLiveSelections(currentProjectId ?? null, selectedObjectIds);
  const { canDraw } = useProjectPermissions();
  const { toast } = useToast();
  const { theme } = useTheme();
  const isMobile = useMobile();

  const deleteSelectedObjects = useCallback(() => {
    const plan = planDeleteSelection({
      projectRole,
      selectedObjectIds,
      objects,
    });
    if (plan.kind === 'locked') {
      toast({
        title: 'Unlock selected objects first',
        description: 'Locked objects cannot be deleted as part of a selection.',
        variant: 'destructive',
      });
      return;
    }
    if (plan.kind !== 'delete') return;
    saveHistory();
    setObjects(plan.remaining);
    setSelectedObject(undefined);
    requestFullRedraw();
  }, [
    objects,
    projectRole,
    requestFullRedraw,
    saveHistory,
    selectedObjectIds,
    setObjects,
    setSelectedObject,
    toast,
  ]);

  const { workerRef, presentation, rendererStatus } = useCanvasRendererRuntime({
    canvasRef,
    objects,
    zoom,
    viewX,
    viewY,
    theme,
    currentProjectId,
    needsFullRedraw,
    clearFullRedraw,
    setView,
  });

  const {
    textInputPos,
    textInputValue,
    textInputRef,
    setTextInputValue,
    clearTextInput,
    openTextInput,
    submitTextInput,
  } = useCanvasTextInput({
    textFontSize,
    brushColor,
    brushSize,
    brushOpacity,
    addObject,
    saveHistory,
    presentation,
  });
  const viewport = useCanvasViewportSession({
    canvasRef,
    presentation,
    zoom,
    viewX,
    viewY,
    setZoom,
    setView,
    resetView,
  });

  const drawing = useCanvasDrawingSession({
    canvasRef,
    presentation,
    viewport,
    canDraw,
    theme,
    emitCursor,
    openTextInput,
    textInputBlocked: Boolean(textInputPos),
    toast,
  });

  const overlay = selectionOverlayModel({
    selectedObject,
    selectedObjects,
    selectedObjectIds,
    dragPreviewObject: drawing.dragPreviewObject,
    dragPreviewObjects: drawing.dragPreviewObjects,
    projectRole,
  });

  const { hasPendingLocalOperations } = useCanvasCollaborationSync({
    canDraw,
    isConnected,
    currentProjectId,
    projectRevision,
    projectTitle,
    documentVersion,
    unsavedChanges,
    objects,
    gestureBusy: Boolean(drawing.draggedObject || activeTransform),
    commitCollaboration,
    requestCanonicalHydration,
  });

  useCanvasKeyboardShortcuts({
    canvasRef,
    workerRef,
    presentation,
    setIsShiftPressed: drawing.setIsShiftPressed,
    onSpacePanStart: drawing.startSpacePan,
    onSpacePanEnd: drawing.endSpacePan,
    setShowShortcuts: drawing.setShowShortcuts,
  });

  const handleImageUpload = useCanvasImageInput({
    canvasRef,
    viewX,
    viewY,
    zoom,
    textInputActive: Boolean(textInputPos),
    addObject,
    saveHistory,
  });

  useCanvasToolReset({
    currentTool,
    clearConstraintMode: drawing.clearConstraintMode,
    clearTriangleVertices: drawing.clearTriangleVertices,
    clearTextInput,
  });

  useCanvasCollaborationAdapter({
    on,
    isConnected,
    currentProjectId,
    projectRevision,
    requestCanonicalHydration,
    hasPendingLocalOperations,
    applyAuthoritativeProject,
    replaceHistory,
    requestFullRedraw,
  });

  const { startTransform } = useCanvasTransformHandles({
    activeTransform,
    setActiveTransform,
    selectedObject,
    projectRole,
    screenToWorld: drawing.screenToWorld,
    updateObject,
    saveHistory,
    pointerPolicyRef: drawing.pointerPolicyRef,
    pointerPolicyInput: drawing.pointerPolicyInput,
    observeCanvasPointerDown: drawing.observeCanvasPointerDown,
    inputPreferences: drawing.inputPreferences,
  });

  return (
    <div
      className={`w-full h-full relative touch-none overscroll-none overflow-hidden ${
        theme === 'dark' ? 'bg-[#0a0a0a]' : 'bg-[#e0e0e0]'
      }`}
    >
      <canvas
        ref={canvasRef}
        data-object-count={objectCount}
        className={`absolute inset-0 w-full h-full touch-none ${
          currentTool === 'hand' || drawing.isSpacePan || drawing.isPanning
            ? drawing.isPanning
              ? 'cursor-grabbing'
              : 'cursor-grab'
            : 'cursor-crosshair'
        }`}
        onContextMenu={(e) => e.preventDefault()}
        {...drawing.canvasPointerHandlers}
      />
      {rendererStatus === 'failed' && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-background/90 p-6 text-center"
          role="alert"
        >
          <div>
            <p className="font-semibold">Canvas renderer unavailable</p>
            <p className="mt-2 text-sm text-muted-foreground">
              The canvas renderer could not start. Reload the board or try another browser.
            </p>
          </div>
        </div>
      )}
      {canvasRef.current && (
        <LiveCursors
          cursors={cursors}
          zoom={zoom}
          viewX={viewX}
          viewY={viewY}
          canvasWidth={canvasRef.current.getBoundingClientRect().width}
          canvasHeight={canvasRef.current.getBoundingClientRect().height}
        />
      )}
      <CanvasShapePreview
        theme={theme}
        viewX={viewX}
        viewY={viewY}
        zoom={zoom}
        previewDrawing={drawing.previewDrawing}
        triangleMode={triangleMode}
        starPoints={starPoints}
        triangleVertices={drawing.triangleVertices}
        currentTool={currentTool}
      />
      <CanvasSelectionOverlays
        objects={objects}
        remoteSelections={remoteSelections}
        multiSelectionBounds={overlay.multiSelectionBounds}
        selectedBounds={overlay.selectedBounds}
        selectedRotation={overlay.selectedRotation}
        selectedCount={selectedObjects.length}
        canDirectTransform={overlay.canDirectTransform}
        projectRole={projectRole}
        viewX={viewX}
        viewY={viewY}
        zoom={zoom}
        selectionRect={drawing.selectionRect}
        onStartTransform={startTransform}
        onDeleteSelected={deleteSelectedObjects}
      />
      <CanvasZoomControls
        zoom={zoom}
        onZoomIn={viewport.zoomIn}
        onZoomOut={viewport.zoomOut}
        onReset={viewport.reset}
      />
      {isMobile && ['rectangle', 'ellipse', 'triangle'].includes(currentTool) && (
        <CanvasConstraintToggle
          currentTool={currentTool}
          isConstraintMode={drawing.isConstraintMode}
          onToggle={() => drawing.setIsConstraintMode(!drawing.isConstraintMode)}
        />
      )}
      {textInputPos && (
        <CanvasTextComposer
          isMobile={isMobile}
          textInputPos={textInputPos}
          textInputRef={textInputRef}
          textInputValue={textInputValue}
          textFontSize={textFontSize}
          brushColor={brushColor}
          setTextInputValue={setTextInputValue}
          setTextFontSize={setTextFontSize}
          clearTextInput={clearTextInput}
          submitTextInput={submitTextInput}
        />
      )}
      <ShortcutsDialog
        mode="draw"
        open={drawing.showShortcuts}
        onOpenChange={drawing.setShowShortcuts}
        showTrigger={false}
      />
      <input
        id="image-upload-input"
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
        aria-label="Upload image"
      />
    </div>
  );
}
