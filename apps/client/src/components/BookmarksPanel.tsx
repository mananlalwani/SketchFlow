import { useState } from 'react';
import { Bookmark, BookmarkPlus, Check, Pencil, Trash2 } from 'lucide-react';
import { useDrawingStore } from '@/store/drawingStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Small navigation list kept beside the inspector so it never covers the canvas. */
export function BookmarksPanel({ compact = false }: { compact?: boolean }) {
  const {
    bookmarks,
    createBookmark,
    renameBookmark,
    deleteBookmark,
    restoreBookmark,
    projectRole,
  } = useDrawingStore();
  const [editingId, setEditingId] = useState<string>();
  const [editingName, setEditingName] = useState('');
  const canEdit = projectRole !== 'viewer';

  const beginRename = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
  };

  const finishRename = () => {
    if (editingId) renameBookmark(editingId, editingName);
    setEditingId(undefined);
  };

  return (
    <section
      className={cn(
        'border-b border-stone-200/90 dark:border-white/[0.08]',
        compact ? 'p-3' : 'px-5 py-4',
      )}
      aria-labelledby="bookmarks-heading"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bookmark className="h-3.5 w-3.5 text-amber-600 dark:text-amber-300" />
          <h2
            id="bookmarks-heading"
            className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500 dark:text-stone-400"
          >
            Bookmarks
          </h2>
        </div>
        {canEdit && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 rounded-lg text-stone-500 hover:text-stone-950 dark:hover:text-white"
            onClick={() => createBookmark()}
            aria-label="Save current view as bookmark"
            title="Save current view"
          >
            <BookmarkPlus className="h-4 w-4" />
          </Button>
        )}
      </div>
      {bookmarks.length === 0 ? (
        <p className="text-xs leading-5 text-stone-500 dark:text-stone-500">
          Save a view to return to a part of the canvas quickly.
        </p>
      ) : (
        <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
          {bookmarks.map((bookmark) => (
            <div
              key={bookmark.id}
              className="group flex items-center gap-1 rounded-lg hover:bg-stone-100 dark:hover:bg-white/[0.05]"
            >
              {editingId === bookmark.id ? (
                <form
                  className="flex min-w-0 flex-1 items-center gap-1"
                  onSubmit={(event) => {
                    event.preventDefault();
                    finishRename();
                  }}
                >
                  <Input
                    autoFocus
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    onBlur={finishRename}
                    className="h-8 min-w-0 bg-white px-2 text-xs dark:bg-stone-950/40"
                    aria-label={`Rename ${bookmark.name}`}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    aria-label="Save bookmark name"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                </form>
              ) : (
                <>
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-xs text-stone-700 outline-none focus-visible:ring-2 focus-visible:ring-amber-400 dark:text-stone-200"
                    onClick={() => restoreBookmark(bookmark.id)}
                    title={`Go to ${bookmark.name}`}
                  >
                    {bookmark.name}
                  </button>
                  {canEdit && (
                    <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => beginRename(bookmark.id, bookmark.name)}
                        aria-label={`Rename ${bookmark.name}`}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-red-600 hover:text-red-700"
                        onClick={() => deleteBookmark(bookmark.id)}
                        aria-label={`Delete ${bookmark.name}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
