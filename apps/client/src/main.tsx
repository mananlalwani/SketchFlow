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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ClerkThemeWrapper>
        <App />
      </ClerkThemeWrapper>
    </ThemeProvider>
  </React.StrictMode>,
);
