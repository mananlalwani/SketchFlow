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
        variables: {
          colorPrimary: isDark ? '#fcd34d' : '#d97706',
          colorBackground: isDark ? '#211e1b' : '#faf9f6',
          colorInputBackground: isDark ? '#2a2724' : '#ffffff',
          colorInputText: isDark ? '#faf7f2' : '#1c1917',
          colorText: isDark ? '#faf7f2' : '#1c1917',
          colorTextSecondary: isDark ? '#b8afa5' : '#6b625a',
          colorDanger: '#dc2626',
          colorSuccess: '#15803d',
          colorWarning: '#d97706',
          borderRadius: '0.75rem',
        },
        elements: {
          rootBox: isDark ? 'bg-[#211e1b]' : 'bg-stone-50',
          card: isDark
            ? 'border border-[#3b352f] bg-[#211e1b] shadow-2xl shadow-black/35'
            : 'border border-stone-200 bg-stone-50 shadow-xl shadow-stone-950/10',

          headerTitle: isDark ? 'text-stone-50' : 'text-stone-950',
          headerSubtitle: isDark ? 'text-stone-400' : 'text-stone-500',

          socialButtonsBlockButton: isDark
            ? 'border-[#3b352f] bg-white/[0.035] text-stone-100 hover:bg-white/[0.08]'
            : 'border-stone-200 bg-white text-stone-900 hover:bg-stone-100',
          socialButtonsBlockButtonText: isDark ? 'text-stone-100' : 'text-stone-900',
          socialButtonsProviderIcon: isDark ? 'bg-white/90 rounded p-0.5' : '',

          dividerLine: isDark ? 'bg-[#3b352f]' : 'bg-stone-200',
          dividerText: isDark ? 'text-stone-400' : 'text-stone-500',

          formFieldLabel: isDark ? 'text-stone-300' : 'text-stone-700',
          formFieldInput: isDark
            ? 'border-[#3b352f] bg-[#2a2724] text-stone-100 placeholder:text-stone-500'
            : 'border-stone-300 bg-white text-stone-900 placeholder:text-stone-400',
          formFieldInputShowPasswordButton: isDark ? 'text-stone-400' : 'text-stone-500',

          formButtonPrimary:
            'bg-amber-400 text-stone-950 shadow-sm shadow-amber-500/20 hover:bg-amber-300',

          footer: isDark ? 'bg-[#211e1b]' : 'bg-stone-50',
          footerActionLink: isDark
            ? 'text-amber-300 hover:text-amber-200'
            : 'text-amber-700 hover:text-amber-800',
          footerActionText: isDark ? 'text-stone-400' : 'text-stone-500',

          userButtonBox: 'focus:shadow-none',
          userButtonTrigger: 'focus:shadow-none',
          userButtonPopoverCard: isDark
            ? 'border-[#3b352f] bg-[#211e1b]'
            : 'border-stone-200 bg-stone-50',
          userButtonPopoverActionButton: isDark
            ? 'text-stone-100 hover:bg-white/[0.06]'
            : 'text-stone-900 hover:bg-stone-100',
          userButtonPopoverActionButtonText: isDark ? 'text-stone-100' : 'text-stone-900',
          userButtonPopoverActionButtonIcon: isDark ? 'text-stone-400' : 'text-stone-500',
          userButtonPopoverFooter: isDark ? 'border-[#3b352f]' : 'border-stone-200',

          userPreviewMainIdentifier: isDark ? 'text-stone-100' : 'text-stone-900',
          userPreviewSecondaryIdentifier: isDark ? 'text-stone-400' : 'text-stone-500',

          modalBackdrop: 'bg-stone-950/55 backdrop-blur-sm',
          modalContent: isDark ? 'border-[#3b352f] bg-[#211e1b]' : 'border-stone-200 bg-stone-50',

          alertText: isDark ? 'text-stone-300' : 'text-stone-700',

          identityPreviewText: isDark ? 'text-stone-100' : 'text-stone-900',
          identityPreviewEditButton: isDark
            ? 'text-stone-400 hover:text-stone-200'
            : 'text-stone-500 hover:text-stone-700',
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}
