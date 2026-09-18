async function request(path, { method = 'GET', body, form } = {}) {
  const init = { method, credentials: 'same-origin', headers: {} };
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
  me: () => request('/auth/me'),
  signup: (username, password) => request('/auth/signup', { method: 'POST', body: { username, password } }),
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  rules: () => request('/catches/species'),
  preview: (species, weight, length) =>
    request(`/catches/preview?${new URLSearchParams({ species, weight, length })}`),
  feed: (before) => request(`/catches?limit=12${before ? `&before=${before}` : ''}`),
  logCatch: (form) => request('/catches', { method: 'POST', form }),
  deleteCatch: (id) => request(`/catches/${id}`, { method: 'DELETE' }),
  leaderboard: (kind) => request(`/leaderboard/${kind}`),
  profile: (username) => request(`/users/${encodeURIComponent(username)}`),
};
