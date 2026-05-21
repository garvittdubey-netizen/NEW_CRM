import axios from 'axios';

const backendUrl =
  (import.meta.env.VITE_BACKEND_URL as string) ||
  (import.meta.env.REACT_APP_BACKEND_URL as string) ||
  'http://localhost:8002/api';

const api = axios.create({
  baseURL: backendUrl,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Global response handling.
// - 401 on a non-auth endpoint → wipe token and redirect to /login
// - 403 → preserve the rejection so callers can surface the message;
//   we deliberately do NOT redirect, otherwise an agent who hits a
//   forbidden action would get bounced out of the app.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url: string = error.config?.url || '';
    const status: number | undefined = error.response?.status;
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register');

    if (status === 401 && !isAuthEndpoint) {
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }

    return Promise.reject(error);
  },
);

/**
 * Extracts a human-readable error message from an axios error.
 * Falls back to the supplied default when the server did not send one.
 */
export function extractApiError(err: unknown, fallback = 'Something went wrong'): string {
  const e = err as {
    response?: { status?: number; data?: { error?: string } };
    message?: string;
  };
  if (e?.response?.data?.error) return e.response.data.error;
  if (e?.response?.status === 403) return 'You do not have permission to perform this action';
  if (e?.message) return e.message;
  return fallback;
}

export default api;
