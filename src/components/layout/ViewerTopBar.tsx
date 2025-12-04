import { useDrawingStore } from '@/store/drawingStore';
import { Button } from '@/components/ui/button';
import { FloatingAuthButton } from '@/components/AuthButton';
import { Share2, ArrowLeft, Eye, ExternalLink } from 'lucide-react';
import { ShortcutsDialog } from '@/components/ShortcutsDialog';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useToast } from '@/hooks/use-toast';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

interface ViewerTopBarProps {
  onBack?: () => void;
  showBackButton?: boolean;
}

export function ViewerTopBar({ onBack, showBackButton = true }: ViewerTopBarProps) {
  const { projectTitle } = useDrawingStore();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const shareToken = searchParams.get('share');
  const [copiedLink, setCopiedLink] = useState(false);
  const copyTimeoutRef = useRef<number>();

  const handleCopyLink = useCallback(async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      toast({ title: 'Link copied', description: 'Viewer link copied to clipboard.' });
      
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast({ title: 'Failed to copy', description: 'Could not copy link.', variant: 'destructive' });
    }
  }, [toast]);

  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
    } else {
      navigate('/view');
    }
  }, [onBack, navigate]);

  const handleOpenInEditor = useCallback(() => {
    navigate('/draw');
  }, [navigate]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const isViewingProject = Boolean(shareToken) || Boolean(projectTitle);

  return (
    <div className="h-14 border-b border-slate-200 dark:border-white/10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md flex items-center px-4 justify-between z-30 relative transition-colors duration-200">
      <div className="flex items-center gap-4">
        {showBackButton && isViewingProject && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="h-9 w-9 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
        )}
        
        <div className="font-bold text-xl bg-gradient-to-r from-emerald-500 to-teal-600 dark:from-emerald-400 dark:to-teal-500 bg-clip-text text-transparent flex items-center gap-2">
          <Eye className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
          {isViewingProject ? 'Viewer' : 'Shared Projects'}
        </div>
        
        {isViewingProject && (
          <>
            <div className="h-6 w-px bg-slate-200 dark:bg-white/10 mx-2" />
            <div className="flex flex-col justify-center">
              <div className="font-medium text-sm text-slate-700 dark:text-slate-200">
                {projectTitle || 'Shared Project'}
              </div>
              <div className="text-xs text-slate-500 flex items-center gap-2">
                <span className="flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  Read-only
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        {isViewingProject && (
          <>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleCopyLink}
              className={copiedLink ? "text-emerald-500 dark:text-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-300" : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"}
            >
              <Share2 className="w-4 h-4 mr-2" />
              {copiedLink ? 'Copied' : 'Share'}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleOpenInEditor}
              className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Editor
            </Button>

            <div className="h-6 w-px bg-slate-200 dark:bg-white/10 mx-1" />
          </>
        )}

        <ShortcutsDialog mode="view" />

        <div className="h-6 w-px bg-slate-200 dark:bg-white/10 mx-1" />
        
        <ThemeToggle className="text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white" />
        <FloatingAuthButton />
      </div>
    </div>
  );
}
