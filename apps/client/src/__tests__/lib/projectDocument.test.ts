import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeDrawFormat, decodeDrawFormat } from '@/lib/drawFormat';
import {
  deserializeProjectDocument,
  getProjectDocumentDimensions,
  type ProjectBookmark,
} from '@/lib/projectDocument';
import { serializeProject } from '@/lib/utils';

const bookmark: ProjectBookmark = { id: 'overview', name: 'Overview', x: 120, y: 240, zoom: 1.5 };
const objects = [
  {
    id: 'shape-1',
    type: 'rectangle' as const,
    x: 1,
    y: 2,
    width: 30,
    height: 40,
    color: '#fff',
    size: 2,
  },
];

describe('project document metadata', () => {
  beforeEach(() => {
    vi.mocked(crypto.subtle.importKey).mockResolvedValue({} as CryptoKey);
    vi.mocked(crypto.subtle.deriveKey).mockResolvedValue({} as CryptoKey);
    vi.mocked(crypto.subtle.encrypt).mockImplementation(
      async (_algorithm, _key, data) => data as ArrayBuffer,
    );
    vi.mocked(crypto.subtle.decrypt).mockImplementation(
      async (_algorithm, _key, data) => data as ArrayBuffer,
    );
  });

  it('round trips bookmark metadata while reading legacy documents', () => {
    const serialized = serializeProject(objects, 4096, 4096, { bookmarks: [bookmark] });
    expect(deserializeProjectDocument(serialized).metadata.bookmarks).toEqual([bookmark]);
    expect(deserializeProjectDocument(JSON.stringify({ objects })).metadata.bookmarks).toEqual([]);
  });

  it('normalizes legacy array documents into the current project document shape', () => {
    expect(deserializeProjectDocument(objects)).toMatchObject({
      version: 1,
      objects,
      width: 4096,
      height: 4096,
      metadata: { version: 1, bookmarks: [] },
    });
  });

  it('keeps bookmarks through editable .dra encoding and decoding', async () => {
    const encoded = await encodeDrawFormat(
      serializeProject(objects, 4096, 4096, { bookmarks: [bookmark] }),
    );
    const decoded = await decodeDrawFormat(encoded);
    expect(deserializeProjectDocument(decoded).metadata.bookmarks).toEqual([bookmark]);
    expect(deserializeProjectDocument(decoded).objects).toEqual(objects);
  });

  it('persists dimensions needed by objects below the legacy canvas height', () => {
    const tallObjects = [
      {
        ...objects[0],
        y: 7_500,
        height: 900,
      },
    ];
    const serialized = serializeProject(tallObjects, 4096, 4096);
    const document = deserializeProjectDocument(serialized);

    expect(document.width).toBe(4096);
    expect(document.height).toBe(8400);
    expect(getProjectDocumentDimensions(tallObjects, 4096, 4096)).toEqual({
      width: 4096,
      height: 8400,
    });
    expect(document.metadata.bookmarks).toEqual([]);
  });

  it('keeps explicit document dimensions while remaining backward compatible', () => {
    const serialized = serializeProject(objects, 6000, 12000);
    expect(deserializeProjectDocument(serialized)).toMatchObject({ width: 6000, height: 12000 });
    expect(
      deserializeProjectDocument(JSON.stringify({ objects, width: -1, height: 0 })),
    ).toMatchObject({
      width: 4096,
      height: 4096,
    });
  });
});
