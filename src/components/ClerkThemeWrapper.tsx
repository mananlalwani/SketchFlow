import { ClerkProvider } from '@clerk/clerk-react';
import { useTheme } from '@/contexts/ThemeContext';
import { ReactNode } from 'react';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || '';

interface ClerkThemeWrapperProps {
  children: ReactNode;
}

export function ClerkThemeWrapper({ children }: ClerkThemeWrapperProps) {
  const { isDark } = useTheme();

  return (
    <ClerkProvider 
      publishableKey={PUBLISHABLE_KEY}
      appearance={{
        baseTheme: isDark ? undefined : undefined, // Clerk doesn't have built-in themes we import
        variables: {
          colorPrimary: '#3b82f6',
          colorBackground: isDark ? '#0f172a' : '#ffffff',
          colorInputBackground: isDark ? '#1e293b' : '#f8fafc',
          colorInputText: isDark ? '#f1f5f9' : '#0f172a',
          colorText: isDark ? '#f1f5f9' : '#0f172a',
          colorTextSecondary: isDark ? '#94a3b8' : '#64748b',
          colorDanger: '#ef4444',
          colorSuccess: '#22c55e',
          colorWarning: '#f59e0b',
          borderRadius: '0.5rem',
        },
        elements: {
          // Root elements
          rootBox: isDark ? 'bg-slate-900' : 'bg-white',
          card: isDark 
            ? 'bg-slate-900 border-slate-700 shadow-xl' 
            : 'bg-white border-slate-200 shadow-lg',
          
          // Header
          headerTitle: isDark ? 'text-slate-100' : 'text-slate-900',
          headerSubtitle: isDark ? 'text-slate-400' : 'text-slate-500',
          
          // Social buttons
          socialButtonsBlockButton: isDark 
            ? 'bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700' 
            : 'bg-slate-50 border-slate-200 text-slate-900 hover:bg-slate-100',
          socialButtonsBlockButtonText: isDark ? 'text-slate-100' : 'text-slate-900',
          
          // Divider
          dividerLine: isDark ? 'bg-slate-700' : 'bg-slate-200',
          dividerText: isDark ? 'text-slate-400' : 'text-slate-500',
          
          // Form elements
          formFieldLabel: isDark ? 'text-slate-300' : 'text-slate-700',
          formFieldInput: isDark 
            ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500' 
            : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400',
          formFieldInputShowPasswordButton: isDark ? 'text-slate-400' : 'text-slate-500',
          
          // Buttons
          formButtonPrimary: 'bg-blue-600 hover:bg-blue-500 text-white',
          
          // Footer
          footer: isDark ? 'bg-slate-900' : 'bg-white',
          footerActionLink: 'text-blue-500 hover:text-blue-400',
          footerActionText: isDark ? 'text-slate-400' : 'text-slate-500',
          
          // User button
          userButtonBox: 'focus:shadow-none',
          userButtonTrigger: 'focus:shadow-none',
          userButtonPopoverCard: isDark 
            ? 'bg-slate-900 border-slate-700' 
            : 'bg-white border-slate-200',
          userButtonPopoverActionButton: isDark 
            ? 'text-slate-100 hover:bg-slate-800' 
            : 'text-slate-900 hover:bg-slate-100',
          userButtonPopoverActionButtonText: isDark ? 'text-slate-100' : 'text-slate-900',
          userButtonPopoverActionButtonIcon: isDark ? 'text-slate-400' : 'text-slate-500',
          userButtonPopoverFooter: isDark ? 'border-slate-700' : 'border-slate-200',
          
          // User profile
          userPreviewMainIdentifier: isDark ? 'text-slate-100' : 'text-slate-900',
          userPreviewSecondaryIdentifier: isDark ? 'text-slate-400' : 'text-slate-500',
          
          // Modal/Overlay
          modalBackdrop: 'bg-black/50 backdrop-blur-sm',
          modalContent: isDark 
            ? 'bg-slate-900 border-slate-700' 
            : 'bg-white border-slate-200',
            
          // Alerts
          alertText: isDark ? 'text-slate-300' : 'text-slate-700',
          
          // Identity preview
          identityPreviewText: isDark ? 'text-slate-100' : 'text-slate-900',
          identityPreviewEditButton: isDark ? 'text-slate-400 hover:text-slate-300' : 'text-slate-500 hover:text-slate-700',
        }
      }}
    >
      {children}
    </ClerkProvider>
  );
}


