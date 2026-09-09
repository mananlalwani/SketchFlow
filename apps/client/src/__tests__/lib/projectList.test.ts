import { describe, expect, it } from 'vitest';
import {
  ALL_NOTES_FOLDER_ID,
  filterAndSortProjects,
  getLastProject,
  getRecentProjects,
} from '@/lib/projectList';

const projects = [
  { id: 'a', userId: 'u', title: 'Alpha', createdAt: 1, updatedAt: 3, folderId: null },
  { id: 'b', userId: 'u', title: 'Beta', createdAt: 3, updatedAt: 1, folderId: 'folder-1' },
  { id: 'c', userId: 'u', title: 'Archive', createdAt: 2, updatedAt: 2, folderId: null },
];

describe('project list helpers', () => {
  it('filters the selected folder when no search query is present', () => {
    expect(
      filterAndSortProjects(projects, '', 'folder-1', 'name', 'asc').map((project) => project.id),
    ).toEqual(['b']);
  });

  it('searches all folders and sorts without mutating the source list', () => {
    expect(
      filterAndSortProjects(projects, 'a', null, 'updated', 'desc').map((project) => project.id),
    ).toEqual(['a', 'c', 'b']);
    expect(projects.map((project) => project.id)).toEqual(['a', 'b', 'c']);
  });

  it('can show all notes while keeping unfiled notes as a separate folder view', () => {
    expect(
      filterAndSortProjects(projects, '', ALL_NOTES_FOLDER_ID, 'updated', 'desc').map(
        (project) => project.id,
      ),
    ).toEqual(['a', 'c', 'b']);
    expect(
      filterAndSortProjects(projects, '', null, 'updated', 'desc').map((project) => project.id),
    ).toEqual(['a', 'c']);
  });

  it('returns recent notes in updated order without mutating the source list', () => {
    expect(getRecentProjects(projects, 2).map((project) => project.id)).toEqual(['a', 'c']);
    expect(projects.map((project) => project.id)).toEqual(['a', 'b', 'c']);
  });

  it('resolves the saved last note and ignores stale ids', () => {
    expect(getLastProject(projects, 'b')?.title).toBe('Beta');
    expect(getLastProject(projects, 'missing')).toBeUndefined();
    expect(getLastProject(projects, null)).toBeUndefined();
  });
});
