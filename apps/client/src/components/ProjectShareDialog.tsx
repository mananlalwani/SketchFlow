import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Share2, Copy, Check, Globe, Lock, UserPlus, Trash2, Loader2, Users } from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';
import { useToast } from '@/hooks/use-toast';
import {
  shareProject,
  unshareProject,
  getCollaborators,
  addCollaboratorByEmail,
  removeCollaborator,
  getProject,
  type ProjectListItem,
} from '@/lib/api';

interface ProjectShareDialogProps {
  project: ProjectListItem;
  onUpdate?: () => void;
  triggerClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ProjectShareDialog({
  project,
  onUpdate,
  triggerClassName,
  open: controlledOpen,
  onOpenChange,
}: ProjectShareDialogProps) {
  const { getToken, userId } = useAuth();
  const { toast } = useToast();
  const [internalOpen, setInternalOpen] = useState(false);

  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;

  const [isShared, setIsShared] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [collaborators, setCollaborators] = useState<
    { userId: string; email?: string; role: string }[]
  >([]);
  const [newCollabEmail, setNewCollabEmail] = useState('');
  const [newCollabRole, setNewCollabRole] = useState<'editor' | 'viewer'>('editor');

  const buildShareUrl = useCallback((shareToken: string) => {
    return `${window.location.origin}/draw?share=${shareToken}`;
  }, []);

  const loadCollaborators = useCallback(async () => {
    if (!open || !project?.id) return;
    try {
      const token = await getToken();
      const collabs = await getCollaborators(project.id, token);
      setCollaborators(collabs);
    } catch (e) {
      console.error('Failed to load collaborators', e);
    }
  }, [project?.id, getToken, open]);

  const refreshShareInfo = useCallback(async () => {
    if (!open || !project?.id) return;
    try {
      const token = await getToken();
      if (!token) return;
      const record = await getProject(project.id, token);
      setIsShared(record.shared || false);
      if (record.shareToken) {
        setShareUrl(buildShareUrl(record.shareToken));
      } else {
        setShareUrl('');
      }
    } catch (e) {
      console.error('Failed to refresh share status', e);
    }
  }, [open, project?.id, getToken, buildShareUrl]);

  useEffect(() => {
    if (open && project) {
      setIsShared(project.shared || false);
      if (project.shareToken) {
        setShareUrl(buildShareUrl(project.shareToken));
      } else {
        setShareUrl('');
      }
      loadCollaborators();
      refreshShareInfo();
    }
  }, [open, project, loadCollaborators, buildShareUrl, refreshShareInfo]);

  if (!project) {
    return null;
  }

  const handleToggleShare = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (isShared) {
        await unshareProject(project.id, token);
        setIsShared(false);
        setShareUrl('');
        toast({ title: 'Link disabled', description: 'Public link has been disabled' });
      } else {
        const result = await shareProject(project.id, token);
        console.log('Share result:', result); // Debug log
        setIsShared(true);
        setShareUrl(buildShareUrl(result.shareToken));
        toast({
          title: 'Sharing enabled',
          description: 'Public link is now active',
        });
      }
      onUpdate?.();
    } catch (e) {
      console.error('Failed to update sharing:', e);
      toast({
        title: 'Failed to update sharing',
        description: e instanceof Error ? e.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  };

  const handleAddCollaborator = async () => {
    if (!newCollabEmail.trim()) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newCollabEmail.trim())) {
      toast({ title: 'Invalid email address', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const token = await getToken();
      await addCollaboratorByEmail(project.id, newCollabEmail.trim(), newCollabRole, token);
      setNewCollabEmail('');
      await loadCollaborators();
      toast({ title: 'Collaborator added' });
      onUpdate?.();
    } catch {
      toast({
        title: 'Failed to add collaborator',
        description: 'User may not exist or is already added.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveCollaborator = async (userId: string) => {
    setLoading(true);
    try {
      const token = await getToken();
      await removeCollaborator(project.id, userId, token);
      await loadCollaborators();
      toast({ title: 'Collaborator removed' });
      onUpdate?.();
    } catch {
      toast({ title: 'Failed to remove collaborator', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Check if user is owner by both role and userId match
  const isOwnerByRole = project?.role === 'owner' || !project?.role;
  const isOwnerByUserId = userId && project?.userId && userId === project.userId;
  const isOwner = isOwnerByRole || isOwnerByUserId;

  // Debug log if there's a mismatch
  if (project && isOwnerByUserId && !isOwnerByRole) {
    console.warn('Role mismatch detected: userId indicates owner but role does not', {
      projectId: project.id,
      userId,
      projectUserId: project.userId,
      role: project.role,
    });
  }

  const isControlled = controlledOpen !== undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={
              triggerClassName || 'h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity'
            }
            onClick={(e) => e.stopPropagation()}
          >
            <Share2 className="w-4 h-4" />
          </Button>
        </DialogTrigger>
      )}
      <DialogContent
        className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10 max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
            <Share2 className="w-5 h-5" />
            Share "{project.title}"
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Public Link Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isShared ? (
                  <Globe className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                ) : (
                  <Lock className="w-4 h-4 text-slate-400" />
                )}
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Public Link
                </span>
              </div>
              {isOwner && (
                <Button
                  variant={isShared ? 'secondary' : 'default'}
                  size="sm"
                  onClick={handleToggleShare}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isShared ? (
                    'Disable'
                  ) : (
                    'Enable'
                  )}
                </Button>
              )}
            </div>

            {isShared && shareUrl && (
              <div className="flex gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-white/10 rounded px-3 py-2 text-sm text-slate-700 dark:text-slate-300"
                />
                <Button variant="secondary" size="icon" onClick={handleCopy}>
                  {copied ? (
                    <Check className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            )}

            <p className="text-xs text-slate-500">
              {isShared
                ? 'Anyone with the link can view this drawing.'
                : 'Generate a public link to share with anyone.'}
            </p>
          </div>

          {/* Collaborators Section */}
          {isOwner && (
            <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-white/10">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Collaborators
                </span>
              </div>

              {/* Add collaborator */}
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="Email address..."
                  value={newCollabEmail}
                  onChange={(e) => setNewCollabEmail(e.target.value)}
                  className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-white/10 rounded px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCollaborator();
                    }
                  }}
                />
                <select
                  value={newCollabRole}
                  onChange={(e) => setNewCollabRole(e.target.value as 'editor' | 'viewer')}
                  className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-white/10 rounded px-2 py-2 text-sm text-slate-900 dark:text-slate-100"
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <Button
                  variant="default"
                  size="icon"
                  onClick={handleAddCollaborator}
                  disabled={loading || !newCollabEmail.trim()}
                >
                  <UserPlus className="w-4 h-4" />
                </Button>
              </div>

              {/* List collaborators */}
              {collaborators.length > 0 ? (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {collaborators.map((c) => (
                    <div
                      key={c.userId}
                      className="flex items-center justify-between bg-slate-100 dark:bg-slate-800/50 rounded px-3 py-2"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="text-sm truncate block text-slate-900 dark:text-slate-100">
                          {c.email || 'Unknown user'}
                        </span>
                        <span className="text-xs text-slate-500 capitalize">{c.role}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 hover:bg-red-500/20 hover:text-red-500 dark:hover:text-red-400 shrink-0"
                        onClick={() => handleRemoveCollaborator(c.userId)}
                        disabled={loading}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  No collaborators yet. Add someone by their email address.
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
