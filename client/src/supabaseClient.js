import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  // This module is imported before main.jsx ever renders, so a thrown error
  // here leaves a blank page with nothing but a console error — write a
  // visible message directly into the DOM so it's never silently blank.
  const message =
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY. ' +
    'Copy client/.env.example to client/.env.local, fill in your Supabase project\'s URL and publishable key ' +
    '(Settings → API), then restart the dev server.';
  document.body.innerHTML = `<pre style="padding:2rem;font:14px/1.5 monospace;white-space:pre-wrap;color:#b91c1c">${message}</pre>`;
  throw new Error(message);
}

export const supabase = createClient(url, key);
