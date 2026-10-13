import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupMarketRoutes } from './server-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 5173);
const isProd = process.env.NODE_ENV === 'production';

app.use(express.json());

// Mount all /api market endpoints
setupMarketRoutes(app);

if (isProd) {
  // Serve production build from dist/
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  // Development mode: Vite dev server middleware
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

app.listen(port, () => {
  console.log(`Paven's Trading Journey is ready at http://localhost:${port} [${isProd ? 'PRODUCTION' : 'DEVELOPMENT'}]`);
});
