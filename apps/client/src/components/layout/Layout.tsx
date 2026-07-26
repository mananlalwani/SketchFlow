import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { PropertiesPanel } from './PropertiesPanel';
import { MobileToolbar } from '@/components/MobileToolbar';

interface LayoutProps {
  children: ReactNode;
  hideDrawingTools?: boolean;
}

export function Layout({ children, hideDrawingTools }: LayoutProps) {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-stone-50 text-stone-900 selection:bg-amber-300/50 transition-colors duration-200 dark:bg-stone-950 dark:text-stone-100">
      <TopBar hideProjectControls={hideDrawingTools} />
      <div className="relative flex flex-1 overflow-hidden">
        {!hideDrawingTools && (
          <div className="hidden sm:block">
            <Sidebar />
          </div>
        )}
        <main className="relative flex-1 overflow-hidden bg-stone-100/50 shadow-inner shadow-stone-950/[0.03] transition-colors duration-200 dark:bg-stone-900/30 dark:shadow-none">
          {children}
        </main>
        {!hideDrawingTools && (
          <div className="hidden lg:block">
            <PropertiesPanel />
          </div>
        )}
      </div>
      {!hideDrawingTools && <MobileToolbar />}
    </div>
  );
}
