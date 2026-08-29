import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('idb', () => ({ openDB: vi.fn() }));

import { openDB } from 'idb';
import { localProjectsService } from '@/lib/localProjects';

describe('localProjectsService cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('clears fallback projects even when IndexedDB is unavailable', async () => {
    vi.mocked(openDB).mockRejectedValue(new Error('IndexedDB unavailable'));
    Object.defineProperty(localStorage, 'length', { value: 3, configurable: true });
    Object.defineProperty(localStorage, 'key', {
      value: vi
        .fn()
        .mockReturnValueOnce('local-project-one')
        .mockReturnValueOnce('theme')
        .mockReturnValueOnce('local-project-two'),
      configurable: true,
    });

    await localProjectsService.clearAll();

    expect(localStorage.removeItem).toHaveBeenCalledTimes(2);
    expect(localStorage.removeItem).toHaveBeenCalledWith('local-project-one');
    expect(localStorage.removeItem).toHaveBeenCalledWith('local-project-two');
  });
});
