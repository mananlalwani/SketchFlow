import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useDrawingStore } from '@/store/drawingStore';
import { useAuthStore } from '@/store/authStore';
import { useSocket } from '@/hooks/useSocket';
import { SignInButton, SignUpButton, UserButton, useClerk } from '@clerk/clerk-react';
import { Palette, Eye, Wifi, WifiOff, RefreshCw, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useRef, useState } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';

export function Navbar() {
  const location = useLocation();
  const { isConnected } = useDrawingStore();
  const { user, isAuthenticated, isLoading, isGuest } = useAuthStore();
  const { reconnect } = useSocket();
  const clerk = useClerk();
  const [navVisible, setNavVisible] = useState(true);
  const navRef = useRef<HTMLDivElement | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const toolbarEls = Array.from(document.querySelectorAll('[data-toolbar]')) as HTMLElement[];
      for (const el of toolbarEls) {
        const r = el.getBoundingClientRect();
        const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (over) {
          if (hideTimerRef.current) {
            window.clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
          }
          setNavVisible(false);
          return;
        }
      }
      if (e.clientY <= 64) {
        if (hideTimerRef.current) {
          window.clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
        setNavVisible(true);
      } else {
        const nav = navRef.current;
        if (nav) {
          const rect = nav.getBoundingClientRect();
          const isOverNav = e.clientX >= rect.left && e.clientX <= rect.right &&
                           e.clientY >= rect.top && e.clientY <= rect.bottom;
          
          if (!isOverNav) {
            if (!hideTimerRef.current) {
              hideTimerRef.current = window.setTimeout(() => {
                setNavVisible(false);
                hideTimerRef.current = null;
              }, 2000);
            }
          } else {
            if (hideTimerRef.current) {
              window.clearTimeout(hideTimerRef.current);
              hideTimerRef.current = null;
            }
            setNavVisible(true);
          }
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  const isDraw = location.pathname === '/draw';
  const isView = location.pathname === '/view';

  return (
    <nav 
      className={cn(
        "fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-white/20 px-6 py-4 transition-all duration-500 ease-out",
        navVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
      )}
      onMouseEnter={() => {
        if (hideTimerRef.current) {
          window.clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
        setNavVisible(true);
      }}
      onMouseLeave={() => {
        if (!hideTimerRef.current) {
          hideTimerRef.current = window.setTimeout(() => {
            setNavVisible(false);
            hideTimerRef.current = null;
          }, 1500);
        }
      }}
    >
      <div ref={navRef} className="flex items-center justify-between max-w-7xl mx-auto">
        {/* Logo and title */}
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-3 group">
            <div className="relative">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                <Palette className="w-6 h-6 text-white" />
              </div>
              <div className="absolute inset-0 bg-blue-400 rounded-xl opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-300" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
              SketchFlow
            </h1>
          </div>
          
          {/* Connection status or Guest badge */}
          {isGuest ? (
            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-300 bg-amber-100 dark:bg-gradient-to-r dark:from-amber-500/20 dark:to-yellow-500/20 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-400/40 shadow-lg shadow-amber-500/10 dark:shadow-amber-500/20">
              <User className="w-3.5 h-3.5" />
              <span>Guest Mode</span>
            </div>
          ) : isAuthenticated && (
            <div className="flex items-center gap-2">
              <div className={cn(
                "flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-300",
                isConnected 
                  ? "bg-green-100 dark:bg-gradient-to-r dark:from-green-500/20 dark:to-emerald-500/20 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-400/40 shadow-lg shadow-green-500/10 dark:shadow-green-500/20" 
                  : "bg-red-100 dark:bg-gradient-to-r dark:from-red-500/20 dark:to-rose-500/20 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-400/40 shadow-lg shadow-red-500/10 dark:shadow-red-500/20"
              )}>
                {isConnected ? (
                  <Wifi className="w-3.5 h-3.5 animate-pulse" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5" />
                )}
                <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
              </div>
              {!isConnected && (
                <Button
                  onClick={reconnect}
                  variant="secondary"
                  size="sm"
                  title="Retry connection"
                  className="h-8 px-3 hover:scale-105"
                >
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center space-x-3">
          {/* Theme toggle */}
          <ThemeToggle className="text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white" />

          <Button
            asChild
            variant={isDraw ? "default" : "secondary"}
            size="sm"
            className={cn(
              "transition-all duration-300 font-medium",
              isDraw && "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30 scale-105"
            )}
          >
            <Link to="/draw" className="flex items-center space-x-2">
              <Palette className="w-4 h-4" />
              <span className="hidden sm:inline">Draw</span>
            </Link>
          </Button>
          
          <Button
            asChild
            variant={isView ? "default" : "secondary"}
            size="sm"
            className={cn(
              "transition-all duration-300 font-medium",
              isView && "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30 scale-105"
            )}
          >
            <Link to="/view" className="flex items-center space-x-2">
              <Eye className="w-4 h-4" />
              <span className="hidden sm:inline">View</span>
            </Link>
          </Button>

          {/* Auth */}
          {!isLoading && isAuthenticated && user ? (
            <div className="flex items-center space-x-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 dark:bg-blue-500/10 border border-blue-300 dark:border-blue-400/30 rounded-lg shadow-lg">
                <User className="w-4 h-4 text-blue-600 dark:text-blue-300" />
                <span className="text-sm text-blue-700 dark:text-blue-200 font-semibold">
                  {user.username}
                </span>
              </div>
              <UserButton afterSignOutUrl="/draw" />
            </div>
          ) : !isLoading ? (
            <div className="flex items-center gap-2">
              {clerk.loaded ? (
                <>
                  <SignInButton mode="modal">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="font-medium hover:scale-105"
                    >
                      <User className="w-4 h-4 mr-1.5" />
                      <span>Sign In</span>
                    </Button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <Button
                      variant="default"
                      size="sm"
                      className="font-medium hover:scale-105 bg-blue-600 hover:bg-blue-700"
                    >
                      <span>Sign Up</span>
                    </Button>
                  </SignUpButton>
                </>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="font-medium"
                  onClick={() => {
                    alert('Clerk is not configured. Please set VITE_CLERK_PUBLISHABLE_KEY in your .env file');
                  }}
                >
                  <User className="w-4 h-4 mr-1.5" />
                  <span>Login</span>
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="font-medium"
                disabled
              >
                <User className="w-4 h-4 mr-1.5" />
                <span>Loading...</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
