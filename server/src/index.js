// All app data now lives in Supabase (see ../../supabase/schema.sql) and the
// client talks to it directly. This server only serves the built React app.
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { CLIENT_DIST } from './lib/paths.js';

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);

if (!fs.existsSync(CLIENT_DIST)) {
  console.error(`${CLIENT_DIST} not found — run \`npm run build\` first.`);
  process.exit(1);
}

app.use(express.static(CLIENT_DIST));
// SPA fallback. Not app.get('*', ...): Express 5's path-to-regexp requires
// named wildcards (e.g. '/*splat'), so a plain middleware is simpler here.
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  res.sendFile(path.join(CLIENT_DIST, 'index.html'));
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Catch N' Score listening on http://localhost:${port}`));
