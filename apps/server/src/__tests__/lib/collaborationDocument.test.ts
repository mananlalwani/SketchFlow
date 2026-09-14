import { describe, expect, it } from 'vitest';
import {
  applyCollaborationToDocument,
  applyObjectOperation,
  asCanonicalDocument,
} from '../../lib/collaborationDocument.js';

describe('collaboration document', () => {
  it('wraps a bare object array as a canonical document', () => {
    expect(asCanonicalDocument([{ id: 'a', type: 'line' }])).toEqual({
      objects: [{ id: 'a', type: 'line' }],
    });
  });

  it('upserts by id and deletes by id', () => {
    const start = { objects: [{ id: 'a', type: 'rect' }] };
    expect(applyObjectOperation(start, 'upsert-object', { object: { id: 'b', type: 'ellipse' } })).toEqual({
      objects: [
        { id: 'a', type: 'rect' },
        { id: 'b', type: 'ellipse' },
      ],
    });
    expect(applyObjectOperation(start, 'upsert-object', { object: { id: 'a', type: 'star' } })).toEqual({
      objects: [{ id: 'a', type: 'star' }],
    });
    expect(applyObjectOperation(start, 'delete-object', { id: 'a' })).toEqual({ objects: [] });
  });

  it('applies a batch atomically and rejects a malformed payload', () => {
    const next = applyCollaborationToDocument({ objects: [{ id: 'a', type: 'rect' }] }, 'batch', {
      operations: [
        { kind: 'upsert-object', data: { object: { id: 'b', type: 'line' } } },
        { kind: 'delete-object', data: { id: 'a' } },
      ],
    });
    expect(next).toEqual({ objects: [{ id: 'b', type: 'line' }] });
    expect(applyCollaborationToDocument({ objects: [] }, 'delete-object', { nope: true })).toBeNull();
  });
});
