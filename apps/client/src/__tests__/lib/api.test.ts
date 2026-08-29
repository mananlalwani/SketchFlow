import { afterEach, describe, expect, it, vi } from 'vitest';
import { NetworkError, ValidationError } from '@/lib/errorHandling';
import {
  createFolder,
  createProject,
  getSharedProject,
  listProjects,
  shareProject,
  updateProject,
} from '@/lib/api';

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

  it('does not retry an ambiguous cloud create failure', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('fetch failed'));

    await expect(createProject('Board', { objects: [] }, 'token')).rejects.toBeInstanceOf(
      NetworkError,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports request timeouts through the network error contract', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new DOMException('Timed out', 'AbortError'));

    await expect(createProject('Board', { objects: [] }, 'token')).rejects.toMatchObject({
      name: 'NetworkError',
      message: 'Network request timed out. Please try again.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['folder creation', () => createFolder('Ideas', '#3b82f6', null, 'token')],
    ['share-token rotation', () => shareProject('project-1', 'token')],
  ])('does not retry ambiguous %s failures', async (_label, request) => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('fetch failed'));

    await expect(request()).rejects.toBeInstanceOf(NetworkError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a successful response with an invalid payload', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ projects: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(listProjects('token')).rejects.toMatchObject({ name: 'ZodError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
    const createBody = await new Request(createUrl, createRequest).text();
    expect(JSON.parse(createBody)).toEqual({
      title: 'Board',
      data: { objects: [] },
    });

    const [updateUrl, updateRequest] = fetchMock.mock.calls[1];
    expect(updateUrl).toMatch(/\/api\/projects\/project-1$/);
    const updateBody = await new Request(updateUrl, updateRequest).text();
    expect(JSON.parse(updateBody)).toEqual({
      title: 'Renamed board',
      data: { objects: [] },
      expectedRevision: 1,
    });
  });

  it('parses the redacted public project representation without private user fields', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'project-1',
          title: 'Shared board',
          data: { objects: [] },
          createdAt: 1,
          updatedAt: 2,
          revision: 3,
          shared: true,
          role: 'viewer',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(getSharedProject('public-token')).resolves.toEqual({
      id: 'project-1',
      title: 'Shared board',
      data: { objects: [] },
      createdAt: 1,
      updatedAt: 2,
      revision: 3,
      shared: true,
      role: 'viewer',
    });
  });
});
