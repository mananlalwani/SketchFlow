import * as Sentry from '@sentry/node';

import { env } from './config/env.js';

const SHARE_PATH = /\/shared\/[^/?#]+|[?&]share=[^&#]+/gi;

interface ServerExceptionContext extends Record<string, string | number | undefined> {
  method: string;
  route: string;
  status: number;
  traceId?: string;
  spanId?: string;
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

export function captureServerException(error: Error, context: ServerExceptionContext): void {
  Sentry.captureException(error, {
    contexts: { sketchflow: context },
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
    extra: details,
  });
}
