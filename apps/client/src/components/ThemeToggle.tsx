import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Sun, Moon } from 'lucide-react';

interface ThemeToggleProps {
  className?: string;
  size?: 'sm' | 'default' | 'icon';
}

export function ThemeToggle({ className, size = 'icon' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size={size}
      onClick={toggleTheme}
      className={className}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span className="relative flex h-4 w-4 items-center justify-center" aria-hidden="true">
        <Sun
          className={`contextual-icon absolute h-4 w-4 ${theme === 'dark' ? 'scale-100 opacity-100 blur-0' : 'scale-[0.25] opacity-0 blur-[4px]'}`}
        />
        <Moon
          className={`contextual-icon h-4 w-4 ${theme === 'dark' ? 'scale-[0.25] opacity-0 blur-[4px]' : 'scale-100 opacity-100 blur-0'}`}
        />
      </span>
    </Button>
  );
}
