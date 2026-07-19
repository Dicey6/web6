import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// PORT and BASE_PATH are injected by the Replit runtime for dev/preview.
// During a production build (Vercel, CI) they are not set — and are not
// needed: server.port / preview.port are ignored by `vite build`, and
// BASE_PATH defaults to "/" which is correct for production.
const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 3000;

const basePath = process.env.BASE_PATH || '/';

// Only load Replit-specific plugins when running inside a Replit environment.
const isReplit = process.env.REPL_ID !== undefined;

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    ...(isReplit
      ? [
          await import('@replit/vite-plugin-runtime-error-modal').then((m) =>
            m.default(),
          ),
          ...(process.env.NODE_ENV !== 'production'
            ? [
                await import('@replit/vite-plugin-cartographer').then((m) =>
                  m.cartographer({
                    root: path.resolve(import.meta.dirname, '..'),
                  }),
                ),
                await import('@replit/vite-plugin-dev-banner').then((m) =>
                  m.devBanner(),
                ),
              ]
            : []),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    // Output stays inside the package directory.
    // Vercel finds it via outputDirectory in vercel.json (repo root relative).
    // Replit finds it via publicDir in artifact.toml.
    outDir: path.resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
