import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useSearchParams,
} from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppStatePage } from '@/components/AppStatePage';
import { useDrawingStore } from '@/store/drawingStore';
import { useSocket } from '@/hooks/useSocket';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { AutoSaveHandler } from '@/components/AutoSaveHandler';
import { useAuth } from '@clerk/clerk-react';
import { deserializeProject } from '@/lib/utils';
import { useProjectMigration } from '@/hooks/useProjectMigration';
import { WelcomeTutorial, EmptyStateHint } from '@/components/WelcomeTutorial';
import { getSharedProject } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { installProjectSession } from '@/lib/projectSession';
import { AuthPage, SsoCallbackPage } from '@/components/auth/AuthPage';

const DrawingCanvas = lazy(() =>
  import('@/components/DrawingCanvas').then((module) => ({ default: module.DrawingCanvas })),
);
const ProjectManager = lazy(() =>
  import('@/components/ProjectManager').then((module) => ({ default: module.ProjectManager })),
);

function EditorRoute() {
  const {
    objectCount,
    currentProjectId,
    setObjects,
    replaceHistory,
    setProjectTitle,
    requestFullRedraw,
    projectRole,
  } = useDrawingStore();
  const { userId, isLoaded } = useAuth();
  const [initialized, setInitialized] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [searchParams] = useSearchParams();
  const shareToken = searchParams.get('share');
  const { toast } = useToast();

  useEffect(() => {
    if (!isLoaded) return;

    // If we have a share token, prioritize loading that
    if (shareToken) {
      // If we are already displaying this project, don't reload
      // We can't easily check the shareToken against currentProjectId without extra state,
      // but we can check if we just loaded it.
      const loadShared = async () => {
        try {
          const record = await getSharedProject(shareToken);

          // Skip if this project is already loaded
          if (currentProjectId === record.id) {
            setInitialized(true);
            return;
          }

          installProjectSession(record, 'viewer');

          setInitialized(true);
        } catch (e) {
          console.error('Failed to load shared project', e);
          toast({
            title: 'Failed to load shared project',
            description: 'The project may no longer be available.',
            variant: 'destructive',
          });
          setInitialized(true);
        }
      };
      loadShared();
      return;
    }

    const localWork = localStorage.getItem('local_work');

    // If we have a current project already, we are good.
    if (currentProjectId) {
      setInitialized(true);
      return;
    }

    // Try to restore local work if not logged in or no last cloud project
    if (!userId && localWork) {
      try {
        const { title, data } = JSON.parse(localWork);
        const objects = deserializeProject(data);
        setObjects(objects);
        replaceHistory(objects);
        setProjectTitle(title);
        requestFullRedraw();
        // Don't set currentProjectId for local work to keep it "unsaved" relative to cloud
      } catch (e) {
        console.error('Failed to restore local work', e);
      }
      setInitialized(true);
      return;
    }

    // If we have a last project ID and are logged in, we might want to load it (handled by user usually, or auto-load?)
    // For now, let's just show the welcome screen if no active project
    setInitialized(true);
  }, [
    isLoaded,
    userId,
    currentProjectId,
    setObjects,
    replaceHistory,
    setProjectTitle,
    requestFullRedraw,
    shareToken,
    toast,
  ]);

  // Show tutorial on first visit
  useEffect(() => {
    if (initialized && currentProjectId && objectCount === 0) {
      const tutorialCompleted = localStorage.getItem('sketchflow-tutorial-completed');
      if (!tutorialCompleted) {
        setShowTutorial(true);
      }
    }
  }, [initialized, currentProjectId, objectCount]);

  if (!initialized) return null;

  // Show ProjectManager (Welcome Screen) if no content and no active project
  if (!currentProjectId && objectCount === 0) {
    return (
      <Layout hideDrawingTools>
        <Suspense fallback={<AppStatePage kind="loading" />}>
          <ProjectManager onSelect={() => {}} />
        </Suspense>
      </Layout>
    );
  }

  return (
    <Layout hideDrawingTools={projectRole === 'viewer'}>
      <AutoSaveHandler />
      <Suspense fallback={<AppStatePage kind="loading" />}>
        <DrawingCanvas />
      </Suspense>
      {!showTutorial && <EmptyStateHint />}
      {showTutorial && <WelcomeTutorial onComplete={() => setShowTutorial(false)} />}
    </Layout>
  );
}

function App() {
  const { isConnected } = useSocket();
  const { setConnectionStatus } = useDrawingStore();

  // Handle automatic migration of guest projects when user signs in
  useProjectMigration();

  useEffect(() => {
    setConnectionStatus(isConnected);
  }, [isConnected, setConnectionStatus]);

  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          <Route path="/" element={<Navigate to="/draw" replace />} />

          {/* Editor Route wrapped in Layout with logic */}
          <Route path="/draw" element={<EditorRoute />} />
          <Route path="/auth/:mode" element={<AuthPage />} />
          <Route path="/auth/sso-callback" element={<SsoCallbackPage />} />

          <Route path="*" element={<AppStatePage kind="not-found" />} />
        </Routes>
        <Toaster />
      </Router>
    </ErrorBoundary>
  );
}

export default App;
