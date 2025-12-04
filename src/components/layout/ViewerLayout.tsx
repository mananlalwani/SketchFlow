import { ReactNode, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ViewerTopBar } from './ViewerTopBar';
import { ViewerSidebar } from './ViewerSidebar';
import { SharedProjectBrowser } from '@/components/SharedProjectBrowser';
import { useDrawingStore } from '@/store/drawingStore';

interface ViewerLayoutProps {
  children: ReactNode;
}

export function ViewerLayout({ children }: ViewerLayoutProps) {
  const [searchParams] = useSearchParams();
  const shareToken = searchParams.get('share');
  const { projectTitle, objectCount } = useDrawingStore();
  const [showCanvas, setShowCanvas] = useState(false);

  useEffect(() => {
    if (shareToken || (projectTitle && objectCount > 0)) {
      setShowCanvas(true);
    }
  }, [shareToken, projectTitle, objectCount]);

  const handleBack = () => {
    useDrawingStore.getState().newProject();
    setShowCanvas(false);
  };

  const handleProjectLoad = () => {
    setShowCanvas(true);
  };

  if (!showCanvas) {
    return (
      <div className="flex flex-col h-screen w-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden selection:bg-emerald-500/30 transition-colors duration-200">
        <ViewerTopBar showBackButton={false} />
        <div className="flex-1 overflow-hidden">
          <SharedProjectBrowser onProjectLoad={handleProjectLoad} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden selection:bg-emerald-500/30 transition-colors duration-200">
      <ViewerTopBar onBack={handleBack} />
      <div className="flex flex-1 overflow-hidden relative">
        <ViewerSidebar />
        <main className="flex-1 relative overflow-hidden bg-slate-100/50 dark:bg-slate-900/50 shadow-inner transition-colors duration-200">
          {children}
        </main>
      </div>
    </div>
  );
}
