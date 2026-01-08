import { z } from 'zod';
/**
 * Server-side environment variable validation using Zod
 * This ensures all required environment variables are present and valid at startup
 */
declare const envSchema: z.ZodObject<{
    NODE_ENV: z.ZodDefault<z.ZodEnum<{
        development: "development";
        production: "production";
        test: "test";
    }>>;
    PORT: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    HOST: z.ZodDefault<z.ZodString>;
    DATABASE_URL: z.ZodString;
    CLERK_SECRET_KEY: z.ZodString;
    CLERK_PUBLISHABLE_KEY: z.ZodOptional<z.ZodString>;
    VITE_CLERK_PUBLISHABLE_KEY: z.ZodOptional<z.ZodString>;
    CORS_ORIGINS: z.ZodPipe<z.ZodOptional<z.ZodString>, z.ZodTransform<string[], string | undefined>>;
    LOG_LEVEL: z.ZodDefault<z.ZodEnum<{
        debug: "debug";
        info: "info";
        warn: "warn";
        error: "error";
    }>>;
    LOG_FORMAT: z.ZodDefault<z.ZodEnum<{
        pretty: "pretty";
        json: "json";
    }>>;
    OTEL_SERVICE_NAME: z.ZodOptional<z.ZodString>;
    OTEL_SERVICE_VERSION: z.ZodOptional<z.ZodString>;
    OTEL_EXPORTER_OTLP_ENDPOINT: z.ZodOptional<z.ZodString>;
    OTEL_EXPORTER_OTLP_HEADERS: z.ZodOptional<z.ZodString>;
    HONEYCOMB_API_KEY: z.ZodOptional<z.ZodString>;
    HONEYCOMB_DATASET: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type Env = z.infer<typeof envSchema>;
export declare const env: {
    NODE_ENV: "development" | "production" | "test";
    PORT: number;
    HOST: string;
    DATABASE_URL: string;
    CLERK_SECRET_KEY: string;
    CORS_ORIGINS: string[];
    LOG_LEVEL: "debug" | "info" | "warn" | "error";
    LOG_FORMAT: "pretty" | "json";
    CLERK_PUBLISHABLE_KEY?: string | undefined;
    VITE_CLERK_PUBLISHABLE_KEY?: string | undefined;
    OTEL_SERVICE_NAME?: string | undefined;
    OTEL_SERVICE_VERSION?: string | undefined;
    OTEL_EXPORTER_OTLP_ENDPOINT?: string | undefined;
    OTEL_EXPORTER_OTLP_HEADERS?: string | undefined;
    HONEYCOMB_API_KEY?: string | undefined;
    HONEYCOMB_DATASET?: string | undefined;
};
export declare const isDev: boolean;
export declare const isProd: boolean;
export declare const isTest: boolean;
export declare const clerkPublishableKey: string | undefined;
export {};
//# sourceMappingURL=env.d.ts.map