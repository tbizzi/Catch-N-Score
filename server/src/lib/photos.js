import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { UPLOAD_DIR } from './paths.js';

/** Detect the image type from magic bytes (never trust the client's mimetype). */
function detectExt(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.toString('ascii', 0, 3) === 'GIF') return 'gif';
  return null;
}

/** Saves an uploaded image buffer; returns the stored filename, or null if it isn't a supported image. */
export function savePhoto(buf) {
  const ext = detectExt(buf);
  if (!ext) return null;
  const name = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return name;
}

export function deletePhoto(name) {
  if (!name) return;
  fs.rm(path.join(UPLOAD_DIR, path.basename(name)), { force: true }, () => {});
}
