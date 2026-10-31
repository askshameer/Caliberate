const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

function authHeaders() {
  const token = localStorage.getItem('caliberate_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => null);
  }
  const text = await response.text().catch(() => '');
  return text ? { error: text } : null;
}

export async function apiFetch(path, options = {}) {
  const headers = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...authHeaders(),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers,
  });

  if (response.status === 401) {
    const body = await parseResponse(response);
    if (path.startsWith('/auth/login')) {
      throw new Error(body?.error || 'Invalid email or password.');
    }
    localStorage.removeItem('caliberate_token');
    localStorage.removeItem('caliberate_user');
    const isAuthProbe = path.startsWith('/auth/me');
    if (!isAuthProbe && window.location.pathname !== '/login') {
      window.location.assign('/login');
    }
    throw new Error(body?.error || 'Session expired. Please sign in again.');
  }

  const body = await parseResponse(response);

  if (!response.ok) {
    if (body?.code === 'PASSWORD_CHANGE_REQUIRED') {
      window.dispatchEvent(new CustomEvent('caliberate:password-change-required'));
    }
    throw new Error(body?.error || `Request failed (HTTP ${response.status})`);
  }

  return body;
}

export function apiGet(path) {
  return apiFetch(path);
}

export function apiPost(path, data) {
  return apiFetch(path, {
    method: 'POST',
    body: JSON.stringify(data ?? {}),
  });
}

export function apiPut(path, data) {
  return apiFetch(path, {
    method: 'PUT',
    body: JSON.stringify(data ?? {}),
  });
}

export function apiDelete(path) {
  return apiFetch(path, { method: 'DELETE' });
}

export function apiUpload(path, formData) {
  return apiFetch(path, {
    method: 'POST',
    body: formData,
  });
}
