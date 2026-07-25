import * as Sentry from '@sentry/node';

import { env } from './config/env.js';

const SENSITIVE_KEY =
  /(authorization|cookie|token|secret|password|email|image|canvas|object|payload|data|query)/i;
const SHARE_PATH = /\/shared\/[^/?#]+|[?&]share=[^&#]+/gi;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]';
  if (typeof value === 'string') return value.replace(SHARE_PATH, '/shared/[redacted]');
  if (Array.isArray(value)) return value.slice(0, 20).map((entry) => redact(entry, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        SENSITIVE_KEY.test(key) ? '[redacted]' : redact(entry, depth + 1),
      ]),
    );
  }
  return value;
}

export function initSentry(): void {
  if (!env.SENTRY_DSN) return;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV,
    release: env.RELEASE_ID,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request) {
        if (event.request.url)
          event.request.url = event.request.url
            .replace(SHARE_PATH, '/shared/[redacted]')
            .split('?')[0];
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

export function captureServerException(
  error: unknown,
  context: Record<string, unknown> = {},
): void {
  Sentry.captureException(error, {
    contexts: { sketchflow: redact(context) as Record<string, unknown> },
  });
}

export function captureServerSignal(
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
