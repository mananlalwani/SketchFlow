export type ProjectAccessAction = 'view' | 'edit' | 'delete' | 'share' | 'manage';
export type MembershipRole = 'owner' | 'editor' | 'viewer';

export function accessAllows(
  action: ProjectAccessAction,
  input: { isOwner: boolean; collaboratorRole?: string | null },
): boolean {
  if (input.isOwner) return true;
  const role = input.collaboratorRole;
  switch (action) {
    case 'view':
      return role != null && role !== '';
    case 'edit':
      return role === 'editor';
    case 'delete':
    case 'share':
    case 'manage':
      return false;
    default:
      return false;
  }
}

export function membershipRole(
  ownerId: string,
  userId: string,
  collaboratorRole?: string | null,
): MembershipRole {
  if (ownerId === userId) return 'owner';
  return collaboratorRole === 'editor' ? 'editor' : 'viewer';
}
