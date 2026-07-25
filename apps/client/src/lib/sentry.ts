import * as Sentry from '@sentry/react';

import { clientEnv } from '@/config/env';

const SENSITIVE_KEY =
  /(authorization|cookie|token|secret|password|email|image|canvas|object|payload|data)/i;
const SHARE_PATH = /\/shared\/[^/?#]+|[?&]share=[^&#]+/gi;

function redact(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(SHARE_PATH, '/shared/[redacted]');
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        SENSITIVE_KEY.test(key) ? '[redacted]' : redact(entry),
      ]),
    );
  }
  return value;
}

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
      event.contexts = redact(event.contexts) as typeof event.contexts;
      event.extra = redact(event.extra) as typeof event.extra;
      event.user = undefined;
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      return {
        ...breadcrumb,
        data: redact(breadcrumb.data) as typeof breadcrumb.data,
        message: breadcrumb.message?.replace(SHARE_PATH, '/shared/[redacted]'),
      };
    },
  });
}

export function captureException(error: Error, context?: Record<string, unknown>): void {
  Sentry.captureException(error, {
    contexts: context ? { sketchflow: redact(context) as Record<string, unknown> } : undefined,
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
    extra: redact(details) as Record<string, unknown>,
  });
}

export function setSentryUser(userId: string | null): void {
  // A stable app-specific identifier is intentionally not sent. This only retains auth state.
  Sentry.setTag('auth.state', userId ? 'authenticated' : 'anonymous');
}
