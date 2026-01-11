import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Share2, Copy, Check, ExternalLink, Globe } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareUrl: string | null;
  isShared: boolean;
  projectTitle: string;
  onShare: () => Promise<void>;
  onUnshare: () => Promise<void>;
  isSharing: boolean;
}

export function ShareDialog({
  open,
  onOpenChange,
  shareUrl,
  isShared,
  projectTitle,
  onShare,
  onUnshare,
  isSharing
}: ShareDialogProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast({ title: 'Copied!', description: 'Share link copied to clipboard.' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Copy failed', description: 'Could not copy link.', variant: 'destructive' });
    }
  };

  const handleOpenLink = () => {
    if (shareUrl) {
      window.open(shareUrl, '_blank');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5" />
            Share Project
          </DialogTitle>
          <DialogDescription>
            {isShared 
              ? `"${projectTitle}" is currently shared. Anyone with the link can view it.`
              : `Share "${projectTitle}" with others. They'll be able to view it without logging in.`}
          </DialogDescription>
        </DialogHeader>

        {isShared && shareUrl ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-green-100 dark:bg-green-500/10 border border-green-300 dark:border-green-500/20 rounded-md">
              <Globe className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span className="text-sm text-green-700 dark:text-green-300">Project is shared</span>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-gray-300">Share Link</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  aria-label="Share link"
                  className="flex-1 px-3 py-2 bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-md text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
                <Button
                  onClick={handleCopy}
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                >
                  {copied ? <Check className="w-4 h-4 text-green-500 dark:text-green-400" /> : <Copy className="w-4 h-4" />}
                </Button>
                <Button
                  onClick={handleOpenLink}
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  title="Open in new tab"
                >
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={onUnshare}
                variant="secondary"
                className="flex-1"
                disabled={isSharing}
              >
                {isSharing ? 'Unsharing...' : 'Stop Sharing'}
              </Button>
              <Button
                onClick={() => onOpenChange(false)}
                variant="secondary"
                className="flex-1"
              >
                Close
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-blue-100 dark:bg-blue-500/10 border border-blue-300 dark:border-blue-500/20 rounded-md">
              <p className="text-sm text-slate-700 dark:text-gray-300">
                When you share this project, anyone with the link will be able to view it. 
                They won't need to log in or have an account.
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={onShare}
                className="flex-1"
                disabled={isSharing}
              >
                {isSharing ? (
                  <>
                    <Share2 className="w-4 h-4 mr-2 animate-spin" />
                    Sharing...
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4 mr-2" />
                    Share Project
                  </>
                )}
              </Button>
              <Button
                onClick={() => onOpenChange(false)}
                variant="secondary"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
