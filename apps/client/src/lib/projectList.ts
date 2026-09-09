import type { ProjectListItem } from '@/lib/api';

export type ProjectSortOption = 'updated' | 'created' | 'name';
export type ProjectSortDirection = 'asc' | 'desc';

/** UI-only selection used to show notes from every folder. */
export const ALL_NOTES_FOLDER_ID = '__all_notes__';

function compareProjects(a: ProjectListItem, b: ProjectListItem, sortBy: ProjectSortOption) {
  const comparison =
    sortBy === 'name'
      ? (a.title || '').localeCompare(b.title || '')
      : sortBy === 'created'
        ? (a.createdAt || 0) - (b.createdAt || 0)
        : (a.updatedAt || 0) - (b.updatedAt || 0);

  // Keep equal timestamps deterministic, which is particularly useful for local notes.
  return comparison || (a.title || '').localeCompare(b.title || '') || a.id.localeCompare(b.id);
}

export function filterAndSortProjects(
  projects: ProjectListItem[],
  searchQuery: string,
  selectedFolderId: string | null,
  sortBy: ProjectSortOption,
  sortDirection: ProjectSortDirection,
): ProjectListItem[] {
  const query = searchQuery.trim().toLowerCase();
  let result = query
    ? projects.filter((project) => project.title?.toLowerCase().includes(query))
    : selectedFolderId === ALL_NOTES_FOLDER_ID
      ? projects
      : selectedFolderId === null
        ? projects.filter((project) => !project.folderId)
        : projects.filter((project) => project.folderId === selectedFolderId);

  result = [...result].sort((a, b) => {
    const comparison = compareProjects(a, b, sortBy);
    return sortDirection === 'desc' ? -comparison : comparison;
  });

  return result;
}

/** Returns the most recently updated notes without changing the source array. */
export function getRecentProjects(projects: ProjectListItem[], limit = 4): ProjectListItem[] {
  if (limit <= 0) return [];
  return [...projects].sort((a, b) => -compareProjects(a, b, 'updated')).slice(0, limit);
}

/** Resolves a saved last-note id only when that note is still available. */
export function getLastProject(
  projects: ProjectListItem[],
  lastProjectId: string | null | undefined,
): ProjectListItem | undefined {
  if (!lastProjectId) return undefined;
  return projects.find((project) => project.id === lastProjectId);
}
