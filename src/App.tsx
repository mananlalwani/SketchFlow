import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { DrawingCanvas } from '@/components/DrawingCanvas';
import { ViewerCanvas } from '@/components/ViewerCanvas';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useDrawingStore } from '@/store/drawingStore';
import { useSocket } from '@/hooks/useSocket';
import { useEffect, useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { ViewerLayout } from '@/components/layout/ViewerLayout';
import { AutoSaveHandler } from '@/components/AutoSaveHandler';
import { ProjectManager } from '@/components/ProjectManager';
import { useAuth } from '@clerk/clerk-react';
import { deserializeProject } from '@/lib/utils';

function EditorRoute() {
  // Helper to restore last session on load if nothing loaded
  const { objectCount, currentProjectId, setObjects, replaceHistory, setProjectTitle, requestFullRedraw } = useDrawingStore();
  const { userId, isLoaded } = useAuth();
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    
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
  }, [isLoaded, userId, currentProjectId, setObjects, replaceHistory, setProjectTitle, requestFullRedraw]);

  if (!initialized) return null;

  // Show ProjectManager (Welcome Screen) if no content and no active project
  if (!currentProjectId && objectCount === 0) {
     return (
        <Layout hideDrawingTools>
           <ProjectManager onSelect={() => {}} />
        </Layout>
     );
  }

  return (
    <Layout>
      <AutoSaveHandler />
      <DrawingCanvas />
    </Layout>
  );
}

function App() {
  const { isConnected } = useSocket();
  const { setConnectionStatus } = useDrawingStore();

  useEffect(() => {
    setConnectionStatus(isConnected);
  }, [isConnected, setConnectionStatus]);

  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          <Route path="/" element={<Navigate to="/draw" replace />} />
          
          {/* Editor Route wrapped in Layout with logic */}
          <Route 
            path="/draw" 
            element={<EditorRoute />} 
          />
          
          {/* Viewer Route - Wrapped in ViewerLayout */}
          <Route 
            path="/view" 
            element={
               <ViewerLayout>
                 <ViewerCanvas />
               </ViewerLayout>
            } 
          />
          
          <Route path="*" element={<Navigate to="/draw" replace />} />
        </Routes>
        <Toaster />
      </Router>
    </ErrorBoundary>
  );
}

export default App;
