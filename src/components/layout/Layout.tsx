import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { PropertiesPanel } from './PropertiesPanel';

interface LayoutProps {
  children: ReactNode;
  hideDrawingTools?: boolean;
}

export function Layout({ children, hideDrawingTools }: LayoutProps) {
  return (
    <div className="flex flex-col h-screen w-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden selection:bg-blue-500/30 transition-colors duration-200">
      <TopBar hideProjectControls={hideDrawingTools} />
      <div className="flex flex-1 overflow-hidden relative">
        {!hideDrawingTools && <Sidebar />}
        <main className="flex-1 relative overflow-hidden bg-slate-100/50 dark:bg-slate-900/50 shadow-inner transition-colors duration-200">
          {children}
        </main>
        {!hideDrawingTools && <PropertiesPanel />}
      </div>
    </div>
  );
}
