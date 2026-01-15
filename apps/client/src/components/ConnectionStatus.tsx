import { useSocket } from '@/hooks/useSocket';
import { useAuthStore } from '@/store/authStore';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';

export function ConnectionStatus() {
  const { isConnected, connectionError, reconnect } = useSocket();
  const { isGuest } = useAuthStore();

  if (isGuest) {
    return null;
  }

  if (isConnected) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
        <Wifi className="w-3 h-3" />
        <span className="hidden sm:inline">Connected</span>
      </div>
    );
  }

  if (connectionError) {
    return (
      <button
        onClick={reconnect}
        className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
        title="Click to reconnect"
      >
        <WifiOff className="w-3 h-3" />
        <span className="hidden sm:inline">Offline - Click to retry</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-yellow-600 dark:text-yellow-400">
      <Loader2 className="w-3 h-3 animate-spin" />
      <span className="hidden sm:inline">Connecting...</span>
    </div>
  );
}
