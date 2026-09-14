import { useEffect, useRef, useState } from 'react';
import type { FolderRecord, ProjectListItem } from '@/lib/api';
import { ALL_NOTES_FOLDER_ID, type ProjectSortDirection, type ProjectSortOption } from '@/lib/projectList';
import { useMobile } from '@/hooks/useMobile';

type ViewMode = 'grid' | 'list';

export function useProjectLibraryState() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [guestBannerDismissed, setGuestBannerDismissed] = useState(() => {
    return localStorage.getItem('guest-banner-dismissed') === 'true';
  });
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [lastProjectId, setLastProjectId] = useState<string | null>(() =>
    localStorage.getItem('lastProjectId'),
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<ProjectSortOption>('updated');
  const [sortDirection, setSortDirection] = useState<ProjectSortDirection>('desc');
  const isMobile = useMobile();
  const showFolderNavigation = !isMobile;
  const [viewMode, setViewMode] = useState<ViewMode>(isMobile ? 'list' : 'grid');

  useEffect(() => {
    if (isMobile) {
      setViewMode('list');
    }
  }, [isMobile]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(ALL_NOTES_FOLDER_ID);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [folderRenameValue, setFolderRenameValue] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [sharingProject, setSharingProject] = useState<ProjectListItem | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [mobileRenameProject, setMobileRenameProject] = useState<ProjectListItem | null>(null);
  const [mobileRenameValue, setMobileRenameValue] = useState('');
  const [isRenamingMobileProject, setIsRenamingMobileProject] = useState(false);
  const menuClosedAtRef = useRef<number>(0);

  return {
    projects,
    setProjects,
    folders,
    setFolders,
    guestBannerDismissed,
    setGuestBannerDismissed,
    loading,
    setLoading,
    creating,
    setCreating,
    lastProjectId,
    setLastProjectId,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    sortDirection,
    setSortDirection,
    isMobile,
    showFolderNavigation,
    viewMode,
    setViewMode,
    renamingId,
    setRenamingId,
    renameValue,
    setRenameValue,
    selectedFolderId,
    setSelectedFolderId,
    renamingFolderId,
    setRenamingFolderId,
    folderRenameValue,
    setFolderRenameValue,
    creatingFolder,
    setCreatingFolder,
    newFolderName,
    setNewFolderName,
    sharingProject,
    setSharingProject,
    openMenuId,
    setOpenMenuId,
    showNewProjectDialog,
    setShowNewProjectDialog,
    newProjectName,
    setNewProjectName,
    mobileRenameProject,
    setMobileRenameProject,
    mobileRenameValue,
    setMobileRenameValue,
    isRenamingMobileProject,
    setIsRenamingMobileProject,
    menuClosedAtRef,
  };
}
