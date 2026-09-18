export const USER_KEY = 'cns_user_id';

async function request(path, { method = 'GET', body, form } = {}) {
  const init = { method, credentials: 'same-origin', headers: {} };
  try {
    const id = localStorage.getItem(USER_KEY);
    if (id) init.headers['X-User-Id'] = id;
  } catch { /* storage unavailable */ }
  if (form) {
    init.body = form;
  } else if (body) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

export const api = {
  me: () => request('/session'),
  enterName: (name) => request('/session', { method: 'POST', body: { name } }),
  rules: () => request('/catches/species'),
  preview: (species, weight, length) =>
    request(`/catches/preview?${new URLSearchParams({ species, weight, length })}`),
  feed: (before) => request(`/catches?limit=12${before ? `&before=${before}` : ''}`),
  logCatch: (form) => request('/catches', { method: 'POST', form }),
  deleteCatch: (id) => request(`/catches/${id}`, { method: 'DELETE' }),
  leaderboard: (kind) => request(`/leaderboard/${kind}`),
  profile: (username) => request(`/users/${encodeURIComponent(username)}`),
};
