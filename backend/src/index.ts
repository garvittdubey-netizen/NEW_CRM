import 'dotenv/config';
import express, { Request } from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth.routes';
import { leadRouter } from './routes/lead.routes';
import { usersRouter } from './routes/users.routes';
import { agentsRouter } from './routes/agents.routes';
import { followUpRouter } from './routes/followup.routes';
import { communicationRouter } from './routes/communications.routes';
import { activityRouter } from './routes/activities.routes';
import { analyticsRouter } from './routes/analytics.routes';
import { whatsappWebhookRouter } from './routes/whatsapp-webhook.routes';
import { propertyRouter } from './routes/property.routes';
import { uploadRouter } from './routes/upload.routes';
import { clientRouter } from './routes/client.routes';
import { dealRouter } from './routes/deal.routes';
import { reportRouter } from './routes/report.routes';
import { notificationRouter } from './routes/notification.routes';
import { settingsRouter } from './routes/settings.routes';
import { systemRouter } from './routes/system.routes';
import { prisma } from './lib/prisma';
import { seedAdmin } from './scripts/seed';

const app = express();
const PORT = parseInt(process.env.PORT || '8002', 10);

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5173',
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
  }),
);

// Webhook router needs the *raw* request body for HMAC verification, so we
// mount a JSON parser scoped to this path with a `verify` hook that stashes
// the buffer on req. This MUST come before the global JSON parser.
app.use(
  '/api/webhooks/whatsapp',
  express.json({
    verify: (req: Request & { rawBody?: Buffer }, _res, buf: Buffer) => {
      req.rawBody = Buffer.from(buf);
    },
  }),
  whatsappWebhookRouter,
);

// Global JSON parser for the rest of the API.
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'BuilderOne CRM', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/leads', leadRouter);
app.use('/api/users', usersRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/followups', followUpRouter);
app.use('/api/communications', communicationRouter);
app.use('/api/activities', activityRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/properties', propertyRouter);
app.use('/api/uploads', uploadRouter);
app.use('/api/clients', clientRouter);
app.use('/api/deals', dealRouter);
app.use('/api/reports', reportRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/system', systemRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

async function main() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected');

    await seedAdmin();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Node.js backend running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

main();
