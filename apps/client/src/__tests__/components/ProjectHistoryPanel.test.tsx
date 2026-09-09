import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectHistoryPanel } from '@/components/ProjectHistoryPanel';

const {
  listProjectHistory,
  restoreProjectHistory,
  deserializeProjectDocument,
  applyAuthoritativeProject,
  replaceHistory,
} = vi.hoisted(() => ({
  listProjectHistory: vi.fn(),
  restoreProjectHistory: vi.fn(),
  deserializeProjectDocument: vi.fn(),
  applyAuthoritativeProject: vi.fn(() => true),
  replaceHistory: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  listProjectHistory,
  restoreProjectHistory,
}));

vi.mock('@/lib/projectDocument', () => ({ deserializeProjectDocument }));

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ getToken: vi.fn(async () => 'token') }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/store/drawingStore', () => ({
  useDrawingStore: () => ({
    currentProjectId: 'project-1',
    projectRevision: 4,
    projectRole: 'owner',
    unsavedChanges: false,
    applyAuthoritativeProject,
    replaceHistory,
  }),
}));

describe('ProjectHistoryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listProjectHistory.mockResolvedValue([
      {
        id: 'snapshot-1',
        revision: 2,
        title: 'Earlier board',
        contentHash: 'hash',
        createdAt: Date.now(),
      },
    ]);
    restoreProjectHistory.mockResolvedValue({
      revision: 5,
      title: 'Earlier board',
      data: { objects: [], metadata: { bookmarks: [] } },
    });
    deserializeProjectDocument.mockReturnValue({
      objects: [{ id: 'restored' }],
      metadata: { bookmarks: [] },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('resets local undo history after restoring a canonical snapshot', async () => {
    const user = userEvent.setup();
    render(<ProjectHistoryPanel />);

    await user.click(screen.getByRole('button', { name: /history/i }));
    await waitFor(() => expect(screen.getByTitle('Restore this version')).toBeVisible());
    await user.click(screen.getByTitle('Restore this version'));

    await waitFor(() => expect(applyAuthoritativeProject).toHaveBeenCalled());
    expect(replaceHistory).toHaveBeenCalledWith([{ id: 'restored' }]);
  });
});
