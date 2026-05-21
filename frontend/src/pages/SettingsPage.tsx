/**
 * Settings page — four tabbed sections.
 *
 *   1. Profile      — edit name, change password, upload profile photo.
 *                     Email is read-only (immutable, matches backend contract).
 *   2. Preferences  — theme, notification toggles, default landing page.
 *                     Persisted in localStorage only (per-device).
 *   3. Team Settings (ADMIN only) — auto-assign + agent visibility flags.
 *                     Backed by /api/settings/tenant; behavioural wiring into
 *                     the Leads workflow is deferred to a future phase, so
 *                     each control carries the explicit caption:
 *                     "Saved — activation in future workflow phase".
 *   4. System Status (ADMIN only) — real-time WhatsApp / Cloudinary /
 *                     Database / Backend probes via /api/system/status.
 *
 * No mocks, no fake fallbacks, no theatre. Every value rendered comes from
 * either the backend or the user's own localStorage.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTheme } from 'next-themes';
import {
  User as UserIcon,
  Sliders,
  Users as UsersIcon,
  ShieldCheck,
  Camera,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Upload,
  Trash2,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { extractApiError } from '@/services/api';
import {
  profileApi,
  tenantSettingsApi,
  systemApi,
  loadPreferences,
  savePreferences,
  uploadAvatarToCloudinary,
  LANDING_PAGE_OPTIONS,
  DEFAULT_PREFERENCES,
  type Profile,
  type TenantSettings,
  type SystemStatus,
  type UserPreferences,
  type AgentVisibilityMode,
} from '@/services/settings';
import { isAdminLevel } from '@/lib/roles';

type TabKey = 'profile' | 'preferences' | 'team' | 'system';

interface TabDef {
  key: TabKey;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

const TABS: TabDef[] = [
  { key: 'profile', label: 'Profile', icon: UserIcon },
  { key: 'preferences', label: 'Preferences', icon: Sliders },
  { key: 'team', label: 'Team Settings', icon: UsersIcon, adminOnly: true },
  { key: 'system', label: 'System Status', icon: ShieldCheck, adminOnly: true },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = isAdminLevel(user?.role);
  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  // Allow the navbar dropdown (and any other consumer) to deep-link to a
  // specific tab via `?tab=profile|preferences|team|system`. Falls back to
  // "profile" for unknown/missing values.
  const [searchParams] = useSearchParams();
  const queryTab = searchParams.get('tab') as TabKey | null;
  const initialTab: TabKey =
    queryTab && visibleTabs.some((t) => t.key === queryTab) ? queryTab : 'profile';
  const [active, setActive] = useState<TabKey>(initialTab);

  // Honour query-param changes even when SettingsPage stays mounted (e.g.
  // clicking the navbar's Profile item while already on /settings).
  useEffect(() => {
    if (queryTab && visibleTabs.some((t) => t.key === queryTab)) {
      setActive(queryTab);
    }
    // visibleTabs is recomputed each render but stable in identity terms for
    // a given user; intentionally omit from deps to avoid loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryTab]);

  return (
    <div className="space-y-6 animate-fade-in" data-testid="settings-page">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-heading font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your account, preferences{isAdmin ? ', team rules and system health' : ''}.
        </p>
      </div>

      {/* Tab bar */}
      <div
        className="flex flex-wrap gap-1.5 border-b border-border"
        data-testid="settings-tabs"
        role="tablist"
      >
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const selected = active === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(tab.key)}
              data-testid={`settings-tab-${tab.key}`}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                selected
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
              )}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Panels */}
      {active === 'profile' && <ProfileSection />}
      {active === 'preferences' && <PreferencesSection />}
      {active === 'team' && isAdmin && <TeamSettingsSection />}
      {active === 'system' && isAdmin && <SystemStatusSection />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Profile section
// ─────────────────────────────────────────────────────────────────────────

function ProfileSection() {
  const { refreshUser } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await profileApi.get();
      setProfile(p);
      setName(p.name);
    } catch (e) {
      setSaveError(extractApiError(e, 'Failed to load profile'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const updated = await profileApi.update({ name });
      setProfile(updated);
      // Sync AuthContext so the navbar (and anywhere else reading useAuth)
      // reflects the new name immediately.
      await refreshUser();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (e) {
      setSaveError(extractApiError(e, 'Failed to update profile'));
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChanged = (newUrl: string | null) => {
    setProfile((p) => (p ? { ...p, profileImage: newUrl } : p));
    // Push the new (or cleared) avatar into AuthContext so the navbar
    // re-renders with the Cloudinary image instantly.
    void refreshUser();
  };

  if (loading || !profile) {
    return (
      <Card>
        <CardContent className="p-8 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="animate-spin" size={16} /> Loading profile…
        </CardContent>
      </Card>
    );
  }

  const dirty = name.trim() !== profile.name;

  return (
    <div className="space-y-5" data-testid="settings-profile">
      <Card>
        <CardContent className="p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Account details</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your name, email and profile photo. Email is permanent and cannot be changed —
              ask an administrator to disable this account and create a new one if you need to
              switch email.
            </p>
          </div>

          <AvatarBlock
            user={profile}
            onChange={handleAvatarChanged}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Full name</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="profile-name-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-email" className="flex items-center gap-2">
                Email
                <Badge variant="outline" className="text-[10px] font-normal">
                  immutable
                </Badge>
              </Label>
              <Input
                id="profile-email"
                value={profile.email}
                readOnly
                disabled
                data-testid="profile-email-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Input value={profile.role} readOnly disabled />
            </div>
            <div className="space-y-1.5">
              <Label>Member since</Label>
              <Input
                value={new Date(profile.createdAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
                readOnly
                disabled
              />
            </div>
          </div>

          {saveError && (
            <p className="text-sm text-destructive" data-testid="profile-error">
              {saveError}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button
              onClick={handleSave}
              disabled={!dirty || !name.trim() || saving}
              data-testid="profile-save-button"
            >
              {saving ? <Loader2 className="animate-spin mr-2" size={14} /> : null}
              Save changes
            </Button>
            {saveSuccess && (
              <span
                className="text-sm text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1"
                data-testid="profile-save-success"
              >
                <CheckCircle2 size={14} /> Saved
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <PasswordChangeBlock />
    </div>
  );
}

function AvatarBlock({
  user,
  onChange,
}: {
  user: Profile;
  onChange: (url: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const handlePick = () => fileRef.current?.click();

  const handleFile = async (file: File) => {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be 5 MB or smaller');
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const url = await uploadAvatarToCloudinary(file, setProgress);
      const updated = await profileApi.update({ profileImage: url });
      onChange(updated.profileImage);
    } catch (e) {
      setError(extractApiError(e, 'Upload failed'));
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    setError(null);
    try {
      const updated = await profileApi.update({ profileImage: null });
      onChange(updated.profileImage);
    } catch (e) {
      setError(extractApiError(e, 'Failed to remove photo'));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="flex items-start gap-5">
      <Avatar className="h-20 w-20 ring-2 ring-border" data-testid="profile-avatar">
        {user.profileImage ? (
          <AvatarImage src={user.profileImage} alt={user.name} />
        ) : null}
        <AvatarFallback className="text-xl bg-primary/10 text-primary">{initials}</AvatarFallback>
      </Avatar>

      <div className="flex-1 space-y-2">
        <p className="text-sm font-medium">Profile photo</p>
        <p className="text-xs text-muted-foreground">
          PNG, JPG or WebP. Recommended 256×256. Max 5 MB.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePick}
            disabled={uploading}
            data-testid="profile-avatar-upload-button"
          >
            {uploading ? (
              <>
                <Loader2 className="animate-spin mr-1.5" size={13} />
                Uploading {progress}%
              </>
            ) : (
              <>
                <Upload size={13} className="mr-1.5" />
                {user.profileImage ? 'Change photo' : 'Upload photo'}
              </>
            )}
          </Button>
          {user.profileImage && !uploading && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              disabled={removing}
              data-testid="profile-avatar-remove-button"
            >
              <Trash2 size={13} className="mr-1.5" />
              Remove
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            data-testid="profile-avatar-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = '';
            }}
          />
        </div>
        {error && (
          <p className="text-xs text-destructive" data-testid="profile-avatar-error">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function PasswordChangeBlock() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmNext, setConfirmNext] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirmNext('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (next.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }
    if (next !== confirmNext) {
      setError('New password and confirmation do not match');
      return;
    }
    setSubmitting(true);
    try {
      await profileApi.changePassword({ currentPassword: current, newPassword: next });
      setSuccess(true);
      reset();
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError(extractApiError(e, 'Failed to change password'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Change password</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            You'll need your current password to set a new one. Use 8+ characters.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="password-current">Current password</Label>
            <Input
              id="password-current"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              data-testid="password-current-input"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password-new">New password</Label>
            <Input
              id="password-new"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              data-testid="password-new-input"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password-confirm">Confirm new password</Label>
            <Input
              id="password-confirm"
              type="password"
              value={confirmNext}
              onChange={(e) => setConfirmNext(e.target.value)}
              autoComplete="new-password"
              data-testid="password-confirm-input"
              required
            />
          </div>
          {error && (
            <p className="text-sm text-destructive sm:col-span-2" data-testid="password-error">
              {error}
            </p>
          )}
          <div className="sm:col-span-2 flex items-center gap-3">
            <Button
              type="submit"
              disabled={submitting || !current || !next || !confirmNext}
              data-testid="password-submit-button"
            >
              {submitting ? <Loader2 className="animate-spin mr-2" size={14} /> : null}
              Update password
            </Button>
            {success && (
              <span
                className="text-sm text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1"
                data-testid="password-success"
              >
                <CheckCircle2 size={14} /> Password updated
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Preferences section
// ─────────────────────────────────────────────────────────────────────────

function PreferencesSection() {
  const { theme, setTheme } = useTheme();
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setPrefs(loadPreferences());
  }, []);

  const commit = (next: UserPreferences) => {
    setPrefs(next);
    savePreferences(next);
    setSavedAt(Date.now());
  };

  const toggleNotif = (key: keyof UserPreferences['notifications']) => {
    commit({
      ...prefs,
      notifications: { ...prefs.notifications, [key]: !prefs.notifications[key] },
    });
  };

  return (
    <div className="space-y-5" data-testid="settings-preferences">
      {/* Theme */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Theme</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pick how the interface looks. "System" follows your OS setting.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 max-w-md" data-testid="theme-picker">
            {[
              { v: 'light', label: 'Light', icon: Sun },
              { v: 'dark', label: 'Dark', icon: Moon },
              { v: 'system', label: 'System', icon: Monitor },
            ].map(({ v, label, icon: Icon }) => {
              const selected = theme === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTheme(v)}
                  data-testid={`theme-option-${v}`}
                  className={cn(
                    'flex flex-col items-center justify-center gap-1.5 rounded-md border-2 px-3 py-4 text-sm font-medium transition-colors',
                    selected
                      ? 'border-primary bg-primary/5 text-foreground'
                      : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  <Icon size={18} />
                  {label}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Notification preferences</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Stored on this device. Toggles control which categories of in-app + email alerts
              you opt into.
            </p>
          </div>
          <div className="divide-y divide-border border rounded-md">
            <NotifRow
              testId="notif-emailDigest"
              label="Daily email digest"
              description="Once-a-day summary of new leads, deals and follow-ups."
              checked={prefs.notifications.emailDigest}
              onToggle={() => toggleNotif('emailDigest')}
            />
            <NotifRow
              testId="notif-followUpReminders"
              label="Follow-up reminders"
              description="Get notified for upcoming and overdue follow-ups."
              checked={prefs.notifications.followUpReminders}
              onToggle={() => toggleNotif('followUpReminders')}
            />
            <NotifRow
              testId="notif-whatsAppInbound"
              label="Inbound WhatsApp messages"
              description="Alert when a lead replies on WhatsApp."
              checked={prefs.notifications.whatsAppInbound}
              onToggle={() => toggleNotif('whatsAppInbound')}
            />
            <NotifRow
              testId="notif-systemUpdates"
              label="Product updates"
              description="Announcements about new features and improvements."
              checked={prefs.notifications.systemUpdates}
              onToggle={() => toggleNotif('systemUpdates')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Default landing page */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Default landing page</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              The page you'd like to see first when you open the app. Applied on your next visit.
            </p>
          </div>
          <div className="max-w-sm">
            <Select
              value={prefs.defaultLandingPage}
              onValueChange={(v) => commit({ ...prefs, defaultLandingPage: v })}
            >
              <SelectTrigger data-testid="default-landing-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANDING_PAGE_OPTIONS.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    data-testid={`landing-option-${opt.value.slice(1)}`}
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {savedAt && (
        <p
          className="text-xs text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1"
          data-testid="preferences-saved"
        >
          <CheckCircle2 size={13} /> Saved to this device
        </p>
      )}
    </div>
  );
}

function NotifRow({
  testId,
  label,
  description,
  checked,
  onToggle,
}: {
  testId: string;
  label: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <ToggleSwitch checked={checked} onChange={onToggle} testId={testId} />
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  testId,
  disabled = false,
}: {
  checked: boolean;
  onChange: () => void;
  testId?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      data-testid={testId}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors',
        checked ? 'bg-primary' : 'bg-input',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-5 w-5 bg-white rounded-full shadow transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Team Settings (ADMIN only)
// ─────────────────────────────────────────────────────────────────────────

function TeamSettingsSection() {
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<null | 'auto' | 'visibility'>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await tenantSettingsApi.get();
        setSettings(s);
      } catch (e) {
        setError(extractApiError(e, 'Failed to load team settings'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const update = async (
    field: 'auto' | 'visibility',
    payload: { autoAssignLeadsEnabled?: boolean; agentVisibilityMode?: AgentVisibilityMode },
  ) => {
    setSaving(field);
    setError(null);
    try {
      const updated = await tenantSettingsApi.update(payload);
      setSettings(updated);
    } catch (e) {
      setError(extractApiError(e, 'Failed to save'));
    } finally {
      setSaving(null);
    }
  };

  if (loading || !settings) {
    return (
      <Card>
        <CardContent className="p-8 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="animate-spin" size={16} /> Loading team settings…
        </CardContent>
      </Card>
    );
  }

  const deferredCaption = (
    <span className="text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
      Saved — activation in future workflow phase
    </span>
  );

  return (
    <div className="space-y-5" data-testid="settings-team">
      <Card>
        <CardContent className="p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Team rules</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tenant-wide policies that apply to every agent. Values are persisted; behavioural
              wiring into the Leads workflow is on the roadmap.
            </p>
          </div>

          {/* Auto-assign toggle */}
          <div
            className="flex items-start justify-between gap-4 p-4 border rounded-md"
            data-testid="team-autoassign-row"
          >
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Auto-assign new leads</p>
                {deferredCaption}
              </div>
              <p className="text-xs text-muted-foreground mt-1 max-w-prose">
                When enabled, freshly created leads will be distributed across active agents
                automatically. While disabled, leads remain unassigned until an admin chooses
                an owner.
              </p>
            </div>
            <ToggleSwitch
              checked={settings.autoAssignLeadsEnabled}
              disabled={saving === 'auto'}
              testId="team-autoassign-toggle"
              onChange={() =>
                update('auto', { autoAssignLeadsEnabled: !settings.autoAssignLeadsEnabled })
              }
            />
          </div>

          {/* Agent visibility */}
          <div
            className="flex items-start justify-between gap-4 p-4 border rounded-md"
            data-testid="team-visibility-row"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Agent visibility</p>
                {deferredCaption}
              </div>
              <p className="text-xs text-muted-foreground mt-1 max-w-prose">
                Controls whether agents can see the entire lead pool or only the leads assigned
                to them.
              </p>
            </div>
            <div className="w-[200px]">
              <Select
                value={settings.agentVisibilityMode}
                onValueChange={(v) =>
                  update('visibility', { agentVisibilityMode: v as AgentVisibilityMode })
                }
                disabled={saving === 'visibility'}
              >
                <SelectTrigger data-testid="team-visibility-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OWN_ONLY" data-testid="team-visibility-own">
                    Own leads only
                  </SelectItem>
                  <SelectItem value="ALL" data-testid="team-visibility-all">
                    All leads
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive" data-testid="team-error">
              {error}
            </p>
          )}

          <p className="text-[11px] text-muted-foreground" data-testid="team-meta">
            Last updated {new Date(settings.updatedAt).toLocaleString('en-IN')}
            {settings.updatedBy ? ` by ${settings.updatedBy.name}` : ''}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// System Status (ADMIN only)
// ─────────────────────────────────────────────────────────────────────────

function SystemStatusSection() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await systemApi.status();
      setStatus(s);
    } catch (e) {
      setError(extractApiError(e, 'Failed to load system status'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return (
    <div className="space-y-5" data-testid="settings-system">
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">System status</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Live probes of every external dependency. Latency is measured from the backend
                container.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetch}
              disabled={loading}
              data-testid="system-refresh-button"
            >
              {loading ? (
                <Loader2 className="animate-spin mr-1.5" size={13} />
              ) : (
                <RefreshCw size={13} className="mr-1.5" />
              )}
              Refresh
            </Button>
          </div>

          {error && (
            <p className="text-sm text-destructive" data-testid="system-error">
              {error}
            </p>
          )}

          {status && (
            <div className="space-y-2">
              <StatusRow
                testId="system-row-whatsapp"
                name="WhatsApp Cloud API"
                detail="Meta Graph templates probe"
                probe={status.whatsapp}
              />
              <StatusRow
                testId="system-row-cloudinary"
                name="Cloudinary"
                detail="Image CDN ping"
                probe={status.cloudinary}
              />
              <StatusRow
                testId="system-row-database"
                name="Database"
                detail="PostgreSQL (Neon) — SELECT 1"
                probe={status.database}
              />
              <StatusRow
                testId="system-row-backend"
                name="Backend API"
                detail="Node service self-check"
                probe={status.backend}
              />
            </div>
          )}

          {status && (
            <p className="text-[11px] text-muted-foreground" data-testid="system-checked-at">
              Checked {new Date(status.checkedAt).toLocaleString('en-IN')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusRow({
  name,
  detail,
  probe,
  testId,
}: {
  name: string;
  detail: string;
  probe: { healthy: boolean; latencyMs: number; message: string };
  testId: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 p-3.5 rounded-md border',
        probe.healthy ? 'bg-emerald-50/40 dark:bg-emerald-950/20' : 'bg-rose-50/40 dark:bg-rose-950/20',
      )}
      data-testid={testId}
    >
      <div className="flex items-start gap-3">
        {probe.healthy ? (
          <CheckCircle2
            size={18}
            className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
          />
        ) : (
          <XCircle size={18} className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
        )}
        <div>
          <p className="text-sm font-medium">{name}</p>
          <p className="text-[11px] text-muted-foreground">{detail}</p>
          <p
            className={cn(
              'text-xs mt-1 break-all',
              probe.healthy
                ? 'text-emerald-700 dark:text-emerald-300'
                : 'text-rose-700 dark:text-rose-300',
            )}
            data-testid={`${testId}-message`}
          >
            {probe.message}
          </p>
        </div>
      </div>
      <div className="text-right">
        <Badge
          variant={probe.healthy ? 'default' : 'destructive'}
          className="text-[10px]"
          data-testid={`${testId}-badge`}
        >
          {probe.healthy ? 'HEALTHY' : 'DOWN'}
        </Badge>
        {probe.latencyMs > 0 && (
          <p className="text-[11px] text-muted-foreground mt-1" data-testid={`${testId}-latency`}>
            {probe.latencyMs} ms
          </p>
        )}
      </div>
    </div>
  );
}

// Camera icon kept around for potential future use; suppress the unused-import lint
// without forcing tsc strict to flag it.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _Camera = Camera;
