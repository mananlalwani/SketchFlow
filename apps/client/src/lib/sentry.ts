import * as Sentry from '@sentry/react';

import { clientEnv } from '@/config/env';

const SHARE_PATH = /\/shared\/[^/?#]+|[?&]share=[^&#]+/gi;

export type ErrorTelemetryContext = Record<string, string | number | boolean | undefined>;

function sanitizeUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const parsed = new URL(url, window.location.origin);
    parsed.search = '';
    parsed.pathname = parsed.pathname.replace(/\/shared\/[^/]+/, '/shared/[redacted]');
    return parsed.toString();
  } catch {
    return url.replace(SHARE_PATH, '/shared/[redacted]').split('?')[0];
  }
}

export function initSentry(): void {
  if (!clientEnv.SENTRY_DSN) return;

  Sentry.init({
    dsn: clientEnv.SENTRY_DSN,
    environment: clientEnv.SENTRY_ENVIRONMENT,
    release: clientEnv.RELEASE_ID,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request) {
        event.request.url = sanitizeUrl(event.request.url);
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.headers;
      }
      event.contexts = {};
      event.extra = {};
      event.user = undefined;
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      return {
        ...breadcrumb,
        data: undefined,
        message: breadcrumb.message?.replace(SHARE_PATH, '/shared/[redacted]'),
      };
    },
  });
}

export function captureException(error: Error, context?: ErrorTelemetryContext): void {
  Sentry.captureException(error, {
    contexts: context ? { sketchflow: context } : undefined,
  });
}

export function captureOperationalSignal(
  signal:
    | 'api_5xx'
    | 'persistence_conflict'
    | 'socket_reconnect_exhausted'
    | 'socket_adapter_error'
    | 'collaboration_queue_failed'
    | 'collaboration_replay_conflict',
  details: Record<string, string | number | boolean> = {},
): void {
  Sentry.captureMessage(signal, {
    level: 'warning',
    tags: { signal },
    extra: details,
  });
}

export function setSentryUser(userId: string | null): void {
  // A stable app-specific identifier is intentionally not sent. This only retains auth state.
  Sentry.setTag('auth.state', userId ? 'authenticated' : 'anonymous');
}
