import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { VitePWA } from 'vite-plugin-pwa';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import path from 'path';

const sentryUploadEnabled = Boolean(
  process.env.SENTRY_AUTH_TOKEN &&
    process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT &&
    process.env.VITE_RELEASE_ID,
);

const aliases = {
  '@': path.resolve(__dirname, './src'),
  '@/components': path.resolve(__dirname, './src/components'),
  '@/lib': path.resolve(__dirname, './src/lib'),
  '@/hooks': path.resolve(__dirname, './src/hooks'),
  '@/store': path.resolve(__dirname, './src/store'),
  '@/types': path.resolve(__dirname, './src/types'),
};

if (process.env.VITE_E2E === 'true') {
  Object.assign(aliases, {
    '@clerk/clerk-react': path.resolve(__dirname, './src/test/clerkE2E.tsx'),
  });
}

export default defineConfig({
  plugins: [
    react(),
    ...(sentryUploadEnabled
      ? [
          sentryVitePlugin({
            authToken: process.env.SENTRY_AUTH_TOKEN,
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            release: { name: process.env.VITE_RELEASE_ID },
            sourcemaps: { filesToDeleteAfterUpload: ['dist/**/*.map'] },
            telemetry: false,
          }),
        ]
      : []),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'SketchFlow',
        short_name: 'SketchFlow',
        description:
          'A fast real-time collaborative canvas for drawing, planning, and sharing ideas.',
        theme_color: '#1c1917',
        background_color: '#151210',
        display: 'standalone',
        orientation: 'any',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // PDF tooling is requested explicitly and must not inflate first-install precache.
        globIgnores: [
          'assets/app/pdf-*.js',
          'assets/app/jspdf.*.js',
          'assets/app/html2canvas.*.js',
          'assets/app/purify.*.js',
          'assets/app/index.es-*.js',
          'assets/workers/pdf.worker.*',
          'assets/app/DrawingCanvas-*.js',
          'assets/rendererWorker-*.js',
        ],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: aliases,
  },
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    // Source maps are generated only for authenticated private uploads and deleted afterward.
    // Public production builds never retain linked source maps.
    sourcemap: sentryUploadEnabled ? 'hidden' : false,
    rollupOptions: {
      output: {
        // Keep stable third-party code and optional workers in their own paths.
        // The production Dockerfile copies each path as a separate image layer,
        // so an application-only deploy reuses large vendor layers on a VPS.
        entryFileNames: 'assets/app/[name]-[hash].js',
        chunkFileNames: (chunk) => {
          if (['socket', 'ui', 'clerk', 'router', 'state'].includes(chunk.name)) {
            return 'assets/vendor/[name]-[hash].js';
          }
          if (chunk.name.toLowerCase().includes('worker')) {
            return 'assets/workers/[name]-[hash].js';
          }
          return 'assets/app/[name]-[hash].js';
        },
        assetFileNames: (asset) => {
          const name = asset.names?.[0]?.toLowerCase() ?? '';
          if (name.endsWith('.css')) return 'assets/styles/[name]-[hash][extname]';
          if (name.includes('worker')) return 'assets/workers/[name]-[hash][extname]';
          return 'assets/app/[name]-[hash][extname]';
        },
        manualChunks: {
          socket: ['socket.io-client'],
          ui: ['lucide-react', '@radix-ui/react-dialog', '@radix-ui/react-select'],
          clerk: ['@clerk/clerk-react'],
          router: ['react-router-dom'],
          state: ['zustand', 'zod'],
        },
      },
    },
    // Increase chunk size warning limit for production
    chunkSizeWarningLimit: 500,
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'socket.io-client'],
  },
});
