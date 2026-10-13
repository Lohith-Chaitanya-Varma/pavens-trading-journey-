import express from 'express';
import { setupMarketRoutes } from '../server-core.mjs';

const app = express();
app.use(express.json());

// Mount official Upstox market routes
setupMarketRoutes(app);

export default app;
