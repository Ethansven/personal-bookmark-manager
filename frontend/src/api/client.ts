import { getAccessToken, userManager } from '../auth/oidc';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

export interface ApiError {
  status: number;
  code?: string;
  message: string;
  details?: unknown;
}

/**
 * Issue an authenticated request to the backend.
 * On 401 we kick the user through the PKCE login again.
 * Throws an ApiError for everything else.
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers ?? {});
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (res.status === 401) {
    // Token expired or invalid — re-login.
    void userManager.signinRedirect();
    throw { status: 401, message: 'Re-authenticating…' } satisfies ApiError;
  }

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  const body = (await res.json().catch(() => ({}))) as unknown;
  if (!res.ok) {
    const err = body as { error?: { code?: string; message?: string; details?: unknown } };
    throw {
      status: res.status,
      code: err.error?.code,
      message: err.error?.message ?? `HTTP ${res.status}`,
      details: err.error?.details,
    } satisfies ApiError;
  }
  return body as T;
}

export interface Collection {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Bookmark {
  id: string;
  url: string;
  title: string;
  notes: string | null;
  collectionId: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export const collectionsApi = {
  list: (q?: { search?: string }) => {
    const qs = q?.search ? `?q=${encodeURIComponent(q.search)}` : '';
    return apiFetch<Collection[]>(`/collections${qs}`);
  },
  create: (name: string) =>
    apiFetch<Collection>('/collections', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  remove: (id: string) =>
    apiFetch<void>(`/collections/${id}`, { method: 'DELETE' }),
  listBookmarks: (id: string) =>
    apiFetch<Bookmark[]>(`/collections/${id}/bookmarks`),
};

export const bookmarksApi = {
  list: (q?: { collectionId?: string; search?: string }) => {
    const params = new URLSearchParams();
    if (q?.collectionId) params.set('collectionId', q.collectionId);
    if (q?.search) params.set('q', q.search);
    const qs = params.toString();
    return apiFetch<Bookmark[]>(`/bookmarks${qs ? `?${qs}` : ''}`);
  },
  create: (input: {
    url: string;
    title: string;
    notes?: string;
    collectionId?: string | null;
  }) =>
    apiFetch<Bookmark>('/bookmarks', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  remove: (id: string) =>
    apiFetch<void>(`/bookmarks/${id}`, { method: 'DELETE' }),
};
