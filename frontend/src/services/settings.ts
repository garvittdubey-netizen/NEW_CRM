/**
 * Settings-page service surface.
 *
 *   - Profile     : GET/PUT /api/auth/profile + PUT /api/auth/password
 *   - Tenant      : GET/PUT /api/settings/tenant (PUT is ADMIN only)
 *   - SystemStat. : GET /api/system/status (ADMIN only)
 *
 * Preferences (theme / notifications / default landing page) are local-only
 * and live in `localStorage` — no backend involvement.
 */
import api from './api';

// ── Profile ─────────────────────────────────────────────────────────────────
export interface Profile {
  id: string;
  name: string;
  email: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'AGENT';
  profileImage: string | null;
  createdAt: string;
}

export interface UpdateProfilePayload {
  name?: string;
  profileImage?: string | null;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export const profileApi = {
  get: () => api.get<Profile>('/auth/profile').then((r) => r.data),
  update: (data: UpdateProfilePayload) =>
    api.put<Profile>('/auth/profile', data).then((r) => r.data),
  changePassword: (data: ChangePasswordPayload) =>
    api.put<{ ok: true }>('/auth/password', data).then((r) => r.data),
};

// ── Tenant settings ─────────────────────────────────────────────────────────
export type AgentVisibilityMode = 'OWN_ONLY' | 'ALL';

export interface TenantSettings {
  autoAssignLeadsEnabled: boolean;
  agentVisibilityMode: AgentVisibilityMode;
  updatedAt: string;
  updatedBy: { id: string; name: string } | null;
}

export interface UpdateTenantSettingsPayload {
  autoAssignLeadsEnabled?: boolean;
  agentVisibilityMode?: AgentVisibilityMode;
}

export const tenantSettingsApi = {
  get: () => api.get<TenantSettings>('/settings/tenant').then((r) => r.data),
  update: (data: UpdateTenantSettingsPayload) =>
    api.put<TenantSettings>('/settings/tenant', data).then((r) => r.data),
};

// ── System status ───────────────────────────────────────────────────────────
export interface ServiceProbe {
  healthy: boolean;
  latencyMs: number;
  message: string;
}

export interface SystemStatus {
  whatsapp: ServiceProbe;
  cloudinary: ServiceProbe;
  database: ServiceProbe;
  backend: ServiceProbe;
  checkedAt: string;
}

export const systemApi = {
  status: () => api.get<SystemStatus>('/system/status').then((r) => r.data),
};

// ── Local-only preferences (localStorage) ───────────────────────────────────
//
// Persisted client-side only — kept here so every consumer reads/writes via
// the same helpers and the storage key is centralised.

export interface NotificationPrefs {
  emailDigest: boolean;
  followUpReminders: boolean;
  whatsAppInbound: boolean;
  systemUpdates: boolean;
}

export interface UserPreferences {
  notifications: NotificationPrefs;
  defaultLandingPage: string;
}

const PREF_KEY = 'settings:preferences:v1';

export const DEFAULT_PREFERENCES: UserPreferences = {
  notifications: {
    emailDigest: true,
    followUpReminders: true,
    whatsAppInbound: true,
    systemUpdates: false,
  },
  defaultLandingPage: '/dashboard',
};

export function loadPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      notifications: { ...DEFAULT_PREFERENCES.notifications, ...(parsed.notifications ?? {}) },
      defaultLandingPage: parsed.defaultLandingPage ?? DEFAULT_PREFERENCES.defaultLandingPage,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(prefs: UserPreferences): void {
  localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
}

/** Available landing-page options that the user can choose from. */
export const LANDING_PAGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '/dashboard', label: 'Dashboard' },
  { value: '/leads', label: 'Leads' },
  { value: '/pipeline', label: 'Pipeline' },
  { value: '/followups', label: 'Follow-ups' },
  { value: '/communications', label: 'Communications' },
  { value: '/properties', label: 'Properties' },
  { value: '/clients', label: 'Clients' },
  { value: '/deals', label: 'Deals' },
];

// ── Avatar upload helper (Cloudinary direct, `avatars` folder) ──────────────
//
// Reuses the same signed-upload flow as Properties but targets the dedicated
// `avatars` folder. Returns the secure_url.

import type { CloudinarySignature } from '@/types';

export async function uploadAvatarToCloudinary(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const { data: sig } = await api.get<CloudinarySignature>(
    '/uploads/cloudinary-signature',
    { params: { folder: 'avatars' } },
  );
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', sig.apiKey);
  form.append('timestamp', String(sig.timestamp));
  form.append('signature', sig.signature);
  form.append('folder', sig.folder);

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', sig.uploadUrl);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during avatar upload'));
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.secure_url) {
          resolve(data.secure_url as string);
        } else {
          reject(new Error(data?.error?.message || `Upload failed (${xhr.status})`));
        }
      } catch {
        reject(new Error('Invalid response from Cloudinary'));
      }
    };
    xhr.send(form);
  });
}
