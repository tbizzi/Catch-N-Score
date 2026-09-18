import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const SERVER_ROOT = path.resolve(here, '../..');
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(SERVER_ROOT, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const CLIENT_DIST = path.resolve(SERVER_ROOT, '../client/dist');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
