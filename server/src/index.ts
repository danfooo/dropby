import express from 'express';
import cors from 'cors';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

import authRouter from './routes/auth.js';
import friendsRouter from './routes/friends.js';
import statusRouter from './routes/status.js';
import invitesRouter from './routes/invites.js';
import goingRouter from './routes/going.js';
import notesRouter from './routes/notes.js';
import nudgesRouter from './routes/nudges.js';
import eventsRouter from './routes/events.js';
import feedbackRouter from './routes/feedback.js';
import trackRouter from './routes/track.js';
import adminRouter from './routes/admin.js';

// Start cron jobs
import './cron.js';

const app = express();
const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV !== 'production';

const avatarsDir = join(process.cwd(), 'data', 'avatars');
mkdirSync(avatarsDir, { recursive: true });

const allowedOrigins = isDev
  ? ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:4173']
  : [process.env.APP_URL ?? 'https://drop-by.fly.dev', 'capacitor://localhost'];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

// Security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  if (!isDev) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use(express.json());

// Serve uploaded avatars
app.use('/avatars', express.static(avatarsDir));

// API routes
app.use('/api/auth', authRouter);
app.use('/api/friends', friendsRouter);
app.use('/api/status', statusRouter);
app.use('/api/invites', invitesRouter);
app.use('/api/going', goingRouter);
app.use('/api/notes', notesRouter);
app.use('/api/nudges', nudgesRouter);
app.use('/api/events', eventsRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/track', trackRouter);
app.use('/api/admin', adminRouter);

// Test-only routes — never mounted in production
if (process.env.NODE_ENV === 'test') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const testRouter = require('./routes/test').default;
  app.use('/api/test', testRouter);
}

// Serve static client in production
if (!isDev) {
  const clientDist = join(process.cwd(), '..', 'client', 'dist');
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => res.sendFile(join(clientDist, 'index.html')));
  }
}

app.listen(PORT, () => {
  console.log(`dropby server running on http://localhost:${PORT}`);
});

export default app;
