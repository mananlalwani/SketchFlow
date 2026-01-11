import { z } from 'zod';

/**
 * Server-side environment variable validation using Zod
 * This ensures all required environment variables are present and valid at startup
 */

const envSchema = z.object({
  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Server configuration
  PORT: z.string().transform(Number).default('3000'),
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
  }),

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
