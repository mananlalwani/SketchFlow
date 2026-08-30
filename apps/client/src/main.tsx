// Initialize observability before React renders.
import { initOtel } from './lib/otel';
import { initSentry } from './lib/sentry';

initOtel();
initSentry();

// Start tool usage analytics
import { startAnalyticsLogging } from './lib/analytics';
startAnalyticsLogging();

import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from './contexts/ThemeContext';
import { ClerkThemeWrapper } from './components/ClerkThemeWrapper';
import App from './App.tsx';
import './index.css';
import { loadClerkPublishableKey } from './lib/runtimeConfig';
import { DrawApiPage } from './components/DrawApiPage';

const isDrawApiHost = globalThis.location?.hostname === 'drawapi.mananlalwani.com';

async function bootstrap() {
  const root = ReactDOM.createRoot(document.getElementById('root')!);
  try {
    if (isDrawApiHost) {
      root.render(
        <React.StrictMode>
          <ThemeProvider>
            <DrawApiPage />
          </ThemeProvider>
        </React.StrictMode>,
      );
      return;
    }

    const publishableKey = await loadClerkPublishableKey();
    root.render(
      <React.StrictMode>
        <ThemeProvider>
          <ClerkThemeWrapper publishableKey={publishableKey}>
            <App />
          </ClerkThemeWrapper>
        </ThemeProvider>
      </React.StrictMode>,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not start SketchFlow.';
    root.render(
      <main className="flex min-h-screen items-center justify-center bg-stone-100 p-6 text-stone-950">
        <div className="max-w-md rounded-2xl border border-stone-200 bg-white p-8 shadow-xl">
          <h1 className="text-xl font-semibold">SketchFlow could not start</h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">{message}</p>
        </div>
      </main>,
    );
  }
}

void bootstrap();
