import { afterEach, describe, expect, it, vi } from 'vitest';
import { NetworkError, ValidationError } from '@/lib/errorHandling';
import { createProject, updateProject } from '@/lib/api';

describe('cloud project API', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([400, 409])('does not retry deterministic HTTP %i update failures', async (status) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Revision conflict' }), {
        status,
        statusText: 'Request failed',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(updateProject('project-1', 'Board', {}, 'token', null, 3)).rejects.toEqual(
      expect.objectContaining<Partial<NetworkError>>({
        name: 'NetworkError',
        statusCode: status,
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('requires a revision before issuing an authenticated update request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    await expect(updateProject('project-1', 'Board', {}, 'token')).rejects.toBeInstanceOf(
      ValidationError,
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends only server-supported create and update fields', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'project-1',
            userId: 'user-1',
            title: 'Board',
            data: { objects: [] },
            createdAt: 1,
            updatedAt: 1,
            revision: 1,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'project-1',
            userId: 'user-1',
            title: 'Renamed board',
            data: { objects: [] },
            createdAt: 1,
            updatedAt: 2,
            revision: 2,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    await createProject('Board', { objects: [] }, 'token', 'data:image/jpeg;base64,ignored');
    await updateProject(
      'project-1',
      'Renamed board',
      { objects: [] },
      'token',
      'data:image/jpeg;base64,ignored',
      1,
    );

    const [createUrl, createRequest] = fetchMock.mock.calls[0];
    expect(createUrl).toMatch(/\/api\/projects$/);
    expect(JSON.parse((createRequest as RequestInit).body as string)).toEqual({
      title: 'Board',
      data: { objects: [] },
    });

    const [updateUrl, updateRequest] = fetchMock.mock.calls[1];
    expect(updateUrl).toMatch(/\/api\/projects\/project-1$/);
    expect(JSON.parse((updateRequest as RequestInit).body as string)).toEqual({
      title: 'Renamed board',
      data: { objects: [] },
      expectedRevision: 1,
    });
  });
});
