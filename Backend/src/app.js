import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { isAllowedOrigin } from './cors.js';
import { query } from './db.js';
import { errorHandler } from './http.js';
import { logger } from './logger.js';
import authRoutes from './routes/auth.js';
import peopleRoutes from './routes/people.js';
import callRoutes from './routes/calls.js';
import careRoutes from './routes/care.js';
import billingRoutes from './routes/billing.js';
import engageRoutes from './routes/engage.js';
import reportRoutes from './routes/reports.js';

export const app = express();
app.disable('x-powered-by');
app.use(cors({
  origin(origin, callback) {
    callback(null, isAllowedOrigin(origin));
  }
}));
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const started = Date.now();
  res.on('finish', () => {
    if (req.path !== '/api/health') {
      logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`);
    }
  });
  next();
});

const callPagePath = join(dirname(fileURLToPath(import.meta.url)), 'call-page.html');

app.get('/', (req, res) => {
  res.json({ data: { name: 'Suva Voice API', health: '/api/health' } });
});

app.get('/call/:id', (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) {
    return res.status(404).json({ error: { message: 'Call not found' } });
  }
  res.set('Cache-Control', 'no-store');
  res.type('html').send(readFileSync(callPagePath));
});

app.get('/api/health', async (req, res, next) => {
  try {
    await query('SELECT 1');
    res.json({
      data: {
        service: 'suva-voice-api',
        ok: true,
        demoMode: config.demoMode,
        time: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

app.use('/api/auth', authRoutes);
app.use('/api', peopleRoutes);
app.use('/api', callRoutes);
app.use('/api', careRoutes);
app.use('/api', billingRoutes);
app.use('/api', engageRoutes);
app.use('/api', reportRoutes);
app.use('/api', (req, res) => {
  res.status(404).json({ error: { message: 'API route not found' } });
});
app.use(errorHandler);
