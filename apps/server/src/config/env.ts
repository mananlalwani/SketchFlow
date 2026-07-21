import { z } from 'zod';

/**
 * Server-side environment variable validation using Zod
 * This ensures all required environment variables are present and valid at startup
 */

const envSchema = z.object({
  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Server configuration
  PORT: z.string().default('3000').transform(Number),
  HOST: z.string().default('0.0.0.0'),

  // Database (required)
  DATABASE_URL: z.string().url().startsWith('postgresql://'),

  // Clerk authentication (required)
  CLERK_SECRET_KEY: z.string().min(1, 'CLERK_SECRET_KEY is required'),
  CLERK_PUBLISHABLE_KEY: z.string().min(1, 'CLERK_PUBLISHABLE_KEY is required').optional(),
  VITE_CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),

  // CORS configuration
  CORS_ORIGINS: z.string().optional().transform((val) => {
    if (!val) return [];
    return val.split(',').map(origin => origin.trim()).filter(Boolean);
  }).pipe(z.array(z.string().url().superRefine((origin, context) => {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin.replace(/\/$/, '')) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'CORS origins must be HTTP(S) origins without paths' });
    }
  }))),

  // Client URL for sharing links (fallback to request host if not set)
  CLIENT_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_FORMAT: z.enum(['pretty', 'json']).default('pretty'),

  // OpenTelemetry / Honeycomb (optional - OTel disabled if not set)
  OTEL_SERVICE_NAME: z.string().optional(),
  OTEL_SERVICE_VERSION: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_EXPORTER_OTLP_HEADERS: z.string().optional(),
  HONEYCOMB_API_KEY: z.string().optional(),
  HONEYCOMB_DATASET: z.string().optional(),
}).superRefine((data, context) => {
  if (data.NODE_ENV !== 'production') return;

  if (!/^sk_live_[A-Za-z0-9_-]+$/.test(data.CLERK_SECRET_KEY)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['CLERK_SECRET_KEY'],
      message: 'Production requires a valid Clerk live secret key',
    });
  }

  if (data.CORS_ORIGINS.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['CORS_ORIGINS'],
      message: 'CORS_ORIGINS is required in production',
    });
  }
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

// Validate and export environment configuration
export const env = validateEnv();

// Derived configuration helpers
export const isDev = env.NODE_ENV === 'development';
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

// Get the Clerk publishable key (check both env var names)
export const clerkPublishableKey = env.CLERK_PUBLISHABLE_KEY || env.VITE_CLERK_PUBLISHABLE_KEY;
