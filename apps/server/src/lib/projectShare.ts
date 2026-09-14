export function isActivePublicShare(
  project: {
    shared: boolean;
    shareRevokedAt?: Date | null;
    shareExpiresAt?: Date | null;
  },
  now = new Date(),
): boolean {
  if (!project.shared || project.shareRevokedAt) return false;
  if (project.shareExpiresAt && project.shareExpiresAt <= now) return false;
  return true;
}
