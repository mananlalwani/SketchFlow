import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '@/lib/api';
import { decodeDrawFormat } from '@/lib/drawFormat';
import { importProjectFile } from '@/lib/projectImport';

vi.mock('@/lib/api', () => ({ createProject: vi.fn() }));
vi.mock('@/lib/drawFormat', () => ({
  DRAW_FORMAT_EXTENSION: '.dra',
  decodeDrawFormat: vi.fn(),
}));

describe('importProjectFile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('decodes and persists a draw archive with its filename as the title', async () => {
    const data = { objects: [] };
    vi.mocked(decodeDrawFormat).mockResolvedValue(data);
    vi.mocked(createProject).mockResolvedValue({
      id: 'project-1',
      userId: 'user-1',
      title: 'Ideas',
      data,
      createdAt: 1,
      updatedAt: 1,
      revision: 1,
    });
    const file = new File(['encoded'], 'Ideas.dra');
    Object.defineProperty(file, 'arrayBuffer', {
      value: vi.fn().mockResolvedValue(new ArrayBuffer(7)),
    });

    await expect(importProjectFile(file, 'token')).resolves.toEqual({ format: 'dra' });
    expect(decodeDrawFormat).toHaveBeenCalledWith(expect.any(ArrayBuffer));
    expect(createProject).toHaveBeenCalledWith('Ideas', data, 'token');
  });

  it('rejects unsupported file types before creating a project', async () => {
    await expect(importProjectFile(new File(['x'], 'notes.txt'), 'token')).rejects.toThrow(
      'Unsupported project file type',
    );
    expect(createProject).not.toHaveBeenCalled();
  });
});
