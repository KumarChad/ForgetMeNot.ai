import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { searchRouter } from './routes/search';
import { authRouter } from './routes/auth';
import { metrics } from './services/metrics';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/search', searchRouter);
app.use('/api/auth', authRouter);

// ─── Metrics endpoint ────────────────────────────────────────────────
app.get('/api/metrics', (_req, res) => {
  res.json(metrics.getSummary());
});

app.post('/api/metrics/reset', (_req, res) => {
  metrics.reset();
  res.json({ success: true, message: 'Metrics reset' });
});

app.post('/api/action', async (req, res) => {
  const { action, params } = req.body;
  console.log(`Action requested: ${action}`, params);
  res.json({
    success: true,
    message: `Action "${action}" executed successfully`,
    result: params,
  });
});

app.listen(PORT, () => {
  console.log(`\n  🌸 ForgetMeNot Backend running on http://localhost:${PORT}`);
  console.log(`  📡 Health check: http://localhost:${PORT}/api/health
  📈 Metrics:      http://localhost:${PORT}/api/metrics\n`);
});
