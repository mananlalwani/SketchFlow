import { describe, it, expect, beforeEach } from 'vitest';
import { useDrawingStore } from '@/store/drawingStore';

describe('drawingStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useDrawingStore.setState({
      objects: [],
      currentTool: 'pen',
      eraserMode: 'partial',
      needsFullRedraw: false,
      projectTitle: 'Untitled',
      unsavedChanges: false,
      documentVersion: 0,
      currentProjectId: undefined,
      brushSize: 4,
      textFontSize: 24,
      brushColor: '#ffffff',
      brushOpacity: 1,
      isConnected: false,
      showToolbar: true,
      viewMode: 'draw',
      shapeFilled: false,
      history: [[]],
      historyIndex: 0,
      zoom: 1,
      viewX: 0,
      viewY: 0,
    });
  });

  describe('tool selection', () => {
    it('should change current tool', () => {
      const { setTool } = useDrawingStore.getState();

      setTool('eraser');
      expect(useDrawingStore.getState().currentTool).toBe('eraser');

      setTool('rectangle');
      expect(useDrawingStore.getState().currentTool).toBe('rectangle');
    });
  });

  describe('brush settings', () => {
    it('should set brush size within bounds', () => {
      const { setBrushSize } = useDrawingStore.getState();

      setBrushSize(50);
      expect(useDrawingStore.getState().brushSize).toBe(50);

      setBrushSize(0);
      expect(useDrawingStore.getState().brushSize).toBe(1);

      setBrushSize(200);
      expect(useDrawingStore.getState().brushSize).toBe(100);
    });

    it('keeps text font size independent from brush size and within pixel bounds', () => {
      const { setBrushSize, setTextFontSize } = useDrawingStore.getState();

      setBrushSize(8);
      setTextFontSize(48);
      expect(useDrawingStore.getState().brushSize).toBe(8);
      expect(useDrawingStore.getState().textFontSize).toBe(48);

      setTextFontSize(1);
      expect(useDrawingStore.getState().textFontSize).toBe(12);

      setTextFontSize(300);
      expect(useDrawingStore.getState().textFontSize).toBe(240);
    });

    it('should set brush color', () => {
      const { setBrushColor } = useDrawingStore.getState();

      setBrushColor('#ff0000');
      expect(useDrawingStore.getState().brushColor).toBe('#ff0000');
    });

    it('should set brush opacity within bounds', () => {
      const { setBrushOpacity } = useDrawingStore.getState();

      setBrushOpacity(0.5);
      expect(useDrawingStore.getState().brushOpacity).toBe(0.5);

      setBrushOpacity(0);
      expect(useDrawingStore.getState().brushOpacity).toBe(0.1);

      setBrushOpacity(2);
      expect(useDrawingStore.getState().brushOpacity).toBe(1);
    });
  });

  describe('objects', () => {
    it('should add an object', () => {
      const { addObject } = useDrawingStore.getState();

      addObject({
        id: 'obj-1',
        type: 'stroke',
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
        ],
        color: '#fff',
        size: 2,
      });

      expect(useDrawingStore.getState().objects).toHaveLength(1);
      expect(useDrawingStore.getState().objectCount).toBe(1);
      expect(useDrawingStore.getState().unsavedChanges).toBe(true);
    });

    it('should remove an object', () => {
      const { addObject, removeObject } = useDrawingStore.getState();

      addObject({ id: 'obj-1', type: 'stroke', points: [], color: '#fff', size: 2 });
      addObject({ id: 'obj-2', type: 'stroke', points: [], color: '#000', size: 2 });

      removeObject('obj-1');

      expect(useDrawingStore.getState().objects).toHaveLength(1);
      expect(useDrawingStore.getState().objects[0].id).toBe('obj-2');
    });

    it('should set objects', () => {
      const { setObjects } = useDrawingStore.getState();
      const objects = [
        {
          id: '1',
          type: 'line' as const,
          x: 0,
          y: 0,
          width: 10,
          height: 0,
          color: '#fff',
          size: 1,
        },
        {
          id: '2',
          type: 'rectangle' as const,
          x: 5,
          y: 5,
          width: 20,
          height: 20,
          color: '#000',
          size: 2,
        },
      ];

      setObjects(objects);

      expect(useDrawingStore.getState().objects).toHaveLength(2);
      expect(useDrawingStore.getState().objectCount).toBe(2);
    });

    it('keeps selection valid and updates an individual object', () => {
      const { addObject, setSelectedObject, updateObject, removeObject } =
        useDrawingStore.getState();
      addObject({
        id: 'selected',
        type: 'rectangle',
        x: 1,
        y: 2,
        width: 3,
        height: 4,
        color: '#fff',
        size: 2,
      });

      setSelectedObject('selected');
      updateObject('selected', { color: '#2563eb', alpha: 0.5, filled: true });

      expect(useDrawingStore.getState()).toMatchObject({ selectedObjectId: 'selected' });
      expect(useDrawingStore.getState().objects[0]).toMatchObject({
        color: '#2563eb',
        alpha: 0.5,
        filled: true,
      });

      removeObject('selected');
      expect(useDrawingStore.getState().selectedObjectId).toBeUndefined();
    });
  });

  describe('authoritative project state', () => {
    it('applies clean canonical state without scheduling a local save', () => {
      const objects = [
        {
          id: 'remote-line',
          type: 'line' as const,
          x: 1,
          y: 2,
          width: 3,
          height: 4,
          color: '#fff',
          size: 2,
        },
      ];
      useDrawingStore.setState({ unsavedChanges: false, saveStatus: 'syncing' });

      const applied = useDrawingStore.getState().applyAuthoritativeProject({
        objects,
        title: 'Canonical board',
        revision: 7,
      });

      expect(applied).toBe(true);
      expect(useDrawingStore.getState()).toMatchObject({
        objects,
        objectCount: 1,
        projectTitle: 'Canonical board',
        projectRevision: 7,
        unsavedChanges: false,
        saveStatus: 'saved',
        needsFullRedraw: true,
      });
    });

    it('does not replace unsaved local work with canonical state', () => {
      const localObjects = [
        {
          id: 'local-line',
          type: 'line' as const,
          x: 10,
          y: 20,
          width: 30,
          height: 40,
          color: '#000',
          size: 3,
        },
      ];
      useDrawingStore.setState({
        objects: localObjects,
        projectTitle: 'Local board',
        projectRevision: 5,
        unsavedChanges: true,
        documentVersion: 11,
        saveStatus: 'syncing',
      });

      const applied = useDrawingStore.getState().applyAuthoritativeProject({
        objects: [],
        title: 'Remote board',
        revision: 6,
      });

      expect(applied).toBe(false);
      expect(useDrawingStore.getState()).toMatchObject({
        objects: localObjects,
        projectTitle: 'Local board',
        projectRevision: 5,
        unsavedChanges: true,
        documentVersion: 11,
        saveStatus: 'syncing',
      });
    });

    it('hydrates a project as one clean revision-aware session baseline', () => {
      const objects = [
        {
          id: 'loaded-line',
          type: 'line' as const,
          x: 1,
          y: 2,
          width: 3,
          height: 4,
          color: '#fff',
          size: 2,
        },
      ];
      useDrawingStore.setState({
        currentProjectId: 'previous-project',
        projectRevision: 2,
        unsavedChanges: true,
        documentVersion: 9,
        history: [[], objects],
        historyIndex: 1,
      });

      useDrawingStore.getState().hydrateProject({
        id: 'loaded-project',
        objects,
        title: 'Loaded board',
        revision: 7,
        role: 'viewer',
      });

      expect(useDrawingStore.getState()).toMatchObject({
        currentProjectId: 'loaded-project',
        projectTitle: 'Loaded board',
        projectRevision: 7,
        projectRole: 'viewer',
        objects,
        objectCount: 1,
        history: [objects],
        historyIndex: 0,
        unsavedChanges: false,
        documentVersion: 10,
        saveStatus: 'saved',
        needsFullRedraw: true,
      });

      useDrawingStore.getState().updatePerformanceStats(60);

      expect(useDrawingStore.getState()).toMatchObject({
        fps: 60,
        objects,
        objectCount: 1,
        projectTitle: 'Loaded board',
      });
    });

    it('clears a previous project revision when changing projects', () => {
      useDrawingStore.setState({ currentProjectId: 'project-a', projectRevision: 4 });

      useDrawingStore.getState().setCurrentProject('project-b');

      expect(useDrawingStore.getState().projectRevision).toBeUndefined();
    });
  });

  describe('history', () => {
    it('should save history', () => {
      const { addObject, saveHistory } = useDrawingStore.getState();

      addObject({ id: 'obj-1', type: 'stroke', points: [], color: '#fff', size: 2 });
      saveHistory();

      expect(useDrawingStore.getState().history).toHaveLength(2);
      expect(useDrawingStore.getState().historyIndex).toBe(1);
    });

    it('should undo', () => {
      const { addObject, saveHistory, undo } = useDrawingStore.getState();

      addObject({ id: 'obj-1', type: 'stroke', points: [], color: '#fff', size: 2 });
      saveHistory();
      addObject({ id: 'obj-2', type: 'stroke', points: [], color: '#000', size: 2 });
      saveHistory();
      useDrawingStore.getState().markSaved();

      undo();

      expect(useDrawingStore.getState().objects).toHaveLength(1);
      expect(useDrawingStore.getState().historyIndex).toBe(1);
      expect(useDrawingStore.getState().unsavedChanges).toBe(true);
    });

    it('should redo', () => {
      const { addObject, saveHistory, undo, redo } = useDrawingStore.getState();

      addObject({ id: 'obj-1', type: 'stroke', points: [], color: '#fff', size: 2 });
      saveHistory();
      addObject({ id: 'obj-2', type: 'stroke', points: [], color: '#000', size: 2 });
      saveHistory();

      undo();
      useDrawingStore.getState().markSaved();
      redo();

      expect(useDrawingStore.getState().objects).toHaveLength(2);
      expect(useDrawingStore.getState().unsavedChanges).toBe(true);
    });

    it('should report canUndo and canRedo correctly', () => {
      const { addObject, saveHistory, canUndo, canRedo } = useDrawingStore.getState();

      expect(canUndo()).toBe(false);
      expect(canRedo()).toBe(false);

      addObject({ id: 'obj-1', type: 'stroke', points: [], color: '#fff', size: 2 });
      saveHistory();

      expect(useDrawingStore.getState().canUndo()).toBe(true);
      expect(useDrawingStore.getState().canRedo()).toBe(false);

      useDrawingStore.getState().undo();

      expect(useDrawingStore.getState().canUndo()).toBe(false);
      expect(useDrawingStore.getState().canRedo()).toBe(true);
    });
  });

  describe('project management', () => {
    it('should set project title and mark as unsaved', () => {
      const { setProjectTitle } = useDrawingStore.getState();

      setProjectTitle('My Project');

      expect(useDrawingStore.getState().projectTitle).toBe('My Project');
      expect(useDrawingStore.getState().unsavedChanges).toBe(true);
    });

    it('should mark as saved', () => {
      const { setProjectTitle, markSaved } = useDrawingStore.getState();

      setProjectTitle('Test');
      markSaved();

      expect(useDrawingStore.getState().unsavedChanges).toBe(false);
      expect(useDrawingStore.getState().lastSavedAt).toBeDefined();
    });

    it('keeps newer local edits dirty when an older save completes', () => {
      const { addObject, markSaved } = useDrawingStore.getState();
      addObject({ id: 'saved-object', type: 'stroke', points: [], color: '#fff', size: 2 });
      const savedVersion = useDrawingStore.getState().documentVersion;

      addObject({ id: 'new-object', type: 'stroke', points: [], color: '#000', size: 2 });
      markSaved(savedVersion);

      expect(useDrawingStore.getState()).toMatchObject({
        documentVersion: savedVersion + 1,
        unsavedChanges: true,
        saveStatus: 'saved',
      });
    });

    it('marks the matching document version as saved', () => {
      const { setProjectTitle, markSaved } = useDrawingStore.getState();
      setProjectTitle('Versioned save');
      const savedVersion = useDrawingStore.getState().documentVersion;

      markSaved(savedVersion);

      expect(useDrawingStore.getState().unsavedChanges).toBe(false);
    });

    it('should create new project', () => {
      const { addObject, setProjectTitle, newProject } = useDrawingStore.getState();

      addObject({ id: 'obj-1', type: 'stroke', points: [], color: '#fff', size: 2 });
      setProjectTitle('Old Project');

      newProject();

      expect(useDrawingStore.getState().objects).toHaveLength(0);
      expect(useDrawingStore.getState().projectTitle).toBe('Untitled');
      expect(useDrawingStore.getState().unsavedChanges).toBe(false);
      expect(useDrawingStore.getState().currentProjectId).toBeUndefined();
      expect(useDrawingStore.getState().projectRole).toBe('owner');
    });

    it('clears a stale revision when resetting or clearing the current project', () => {
      useDrawingStore.setState({ currentProjectId: 'project-1', projectRevision: 4 });

      useDrawingStore.getState().setCurrentProject(undefined);
      expect(useDrawingStore.getState().projectRevision).toBeUndefined();

      useDrawingStore.setState({ currentProjectId: 'project-2', projectRevision: 5 });
      useDrawingStore.getState().newProject();
      expect(useDrawingStore.getState().projectRevision).toBeUndefined();
    });
  });

  describe('view', () => {
    it('should set zoom within bounds', () => {
      const { setZoom } = useDrawingStore.getState();

      setZoom(2);
      expect(useDrawingStore.getState().zoom).toBe(2);

      setZoom(0.05);
      expect(useDrawingStore.getState().zoom).toBe(0.1);

      setZoom(10);
      expect(useDrawingStore.getState().zoom).toBe(5);
    });

    it('should set view position', () => {
      const { setView } = useDrawingStore.getState();

      setView(100, 200);

      expect(useDrawingStore.getState().viewX).toBe(100);
      expect(useDrawingStore.getState().viewY).toBe(200);
    });

    it('should reset view', () => {
      const { setZoom, setView, resetView } = useDrawingStore.getState();

      setZoom(3);
      setView(500, 600);
      resetView();

      // resetView centers the view in the middle of the world canvas (2048 - 500, 2048 - 300)
      expect(useDrawingStore.getState().zoom).toBe(1);
      expect(useDrawingStore.getState().viewX).toBe(1548);
      expect(useDrawingStore.getState().viewY).toBe(1748);
    });
  });

  describe('UI state', () => {
    it('should toggle toolbar', () => {
      const { toggleToolbar } = useDrawingStore.getState();

      expect(useDrawingStore.getState().showToolbar).toBe(true);

      toggleToolbar();
      expect(useDrawingStore.getState().showToolbar).toBe(false);

      toggleToolbar();
      expect(useDrawingStore.getState().showToolbar).toBe(true);
    });

    it('should set connection status', () => {
      const { setConnectionStatus } = useDrawingStore.getState();

      setConnectionStatus(true);
      expect(useDrawingStore.getState().isConnected).toBe(true);

      setConnectionStatus(false);
      expect(useDrawingStore.getState().isConnected).toBe(false);
    });

    it('should set shape filled', () => {
      const { setShapeFilled } = useDrawingStore.getState();

      setShapeFilled(true);
      expect(useDrawingStore.getState().shapeFilled).toBe(true);
    });

    it('should set eraser mode', () => {
      const { setEraserMode } = useDrawingStore.getState();

      setEraserMode('object');
      expect(useDrawingStore.getState().eraserMode).toBe('object');
    });
  });
});
