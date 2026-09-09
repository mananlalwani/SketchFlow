import { beforeEach, describe, expect, it } from 'vitest';
import { useDrawingStore } from '@/store/drawingStore';

describe('drawing bookmarks', () => {
  beforeEach(() => {
    useDrawingStore.setState({ bookmarks: [], viewX: 100, viewY: 200, zoom: 1 });
  });

  it('creates, renames, deletes, and restores a viewport bookmark', () => {
    const bookmark = useDrawingStore.getState().createBookmark('Planning');
    expect(bookmark).toMatchObject({ name: 'Planning', x: 100, y: 200, zoom: 1 });

    useDrawingStore.getState().setView(800, 900);
    useDrawingStore.getState().setZoom(2.5);
    expect(useDrawingStore.getState().restoreBookmark(bookmark.id)).toBe(true);
    expect(useDrawingStore.getState()).toMatchObject({ viewX: 100, viewY: 200, zoom: 1 });

    expect(useDrawingStore.getState().renameBookmark(bookmark.id, 'Updated')).toBe(true);
    expect(useDrawingStore.getState().bookmarks[0].name).toBe('Updated');
    expect(useDrawingStore.getState().deleteBookmark(bookmark.id)).toBe(true);
    expect(useDrawingStore.getState().bookmarks).toEqual([]);
  });
});
