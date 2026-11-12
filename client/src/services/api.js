
const API_BASE = 'https://gov-bookapi.vercel.app/api';

const TOKEN_KEY = 'govbook-token';

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (t) => {
  try {
    t
      ? localStorage.setItem(TOKEN_KEY, t)
      : localStorage.removeItem(TOKEN_KEY);
  } catch {}
};

async function request(method, path, body) {
  const token = getToken();
  let res;

  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...(token
          ? { Authorization: `Bearer ${token}` }
          : {}),
      },
      body: body !== undefined
        ? JSON.stringify(body)
        : undefined,
    });
  } catch {
    const e = new Error(
      'Cannot reach the server. Check your connection.'
    );
    e.network = true;
    throw e;
  }

  let data = null;

  try {
    data = await res.json();
  } catch {}

  if (!res.ok) {
    if (
      res.status === 401 &&
      token &&
      !path.startsWith('/auth/login')
    ) {
      window.dispatchEvent(
        new Event('govbook:unauthorized')
      );
    }

    const err = new Error(
      (data && data.message) || `Request failed (${res.status})`
    );

    err.status = res.status;
    err.data = data || {};
    err.code = data && data.code;

    throw err;
  }

  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b = {}) => request('POST', p, b),
  put: (p, b = {}) => request('PUT', p, b),
  patch: (p, b = {}) => request('PATCH', p, b),
};

export const qs = (obj) => {
  const p = new URLSearchParams();

  Object.entries(obj).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      p.set(k, v);
    }
  });

  const s = p.toString();
  return s ? `?${s}` : '';
};
