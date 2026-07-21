import type { ProjectListItem } from '@/lib/api';

export type ProjectSortOption = 'updated' | 'created' | 'name';
export type ProjectSortDirection = 'asc' | 'desc';

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
    : selectedFolderId === null
      ? projects.filter((project) => !project.folderId)
      : projects.filter((project) => project.folderId === selectedFolderId);

  result = [...result].sort((a, b) => {
    const comparison =
      sortBy === 'name'
        ? (a.title || '').localeCompare(b.title || '')
        : sortBy === 'created'
          ? (a.createdAt || 0) - (b.createdAt || 0)
          : (a.updatedAt || 0) - (b.updatedAt || 0);
    return sortDirection === 'desc' ? -comparison : comparison;
  });

  return result;
}
