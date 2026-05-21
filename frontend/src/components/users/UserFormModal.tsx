import { useState, useEffect, useMemo } from 'react';
import { AlertCircle, ShieldAlert } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  usersApi,
  rolesActorCanAssign,
  ROLE_LABELS,
  type ManagedUser,
  type CreateUserPayload,
  type ManagedRole,
} from '@/services/users';
import { extractApiError } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  user?: ManagedUser | null;
}

interface FormState {
  name: string;
  email: string;
  password: string;
  role: ManagedRole;
  isActive: boolean;
}

const EMPTY: FormState = {
  name: '',
  email: '',
  password: '',
  role: 'AGENT',
  isActive: true,
};

export function UserFormModal({ open, onClose, onSuccess, user }: Props) {
  const isEdit = !!user;
  const { user: currentUser } = useAuth();
  const isSelf = !!user && user.id === currentUser?.id;

  const assignableRoles = useMemo(
    () => rolesActorCanAssign(currentUser?.role),
    [currentUser?.role],
  );

  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setConfirmOpen(false);
    if (user) {
      setForm({
        name: user.name,
        email: user.email,
        password: '',
        role: user.role,
        isActive: user.isActive,
      });
    } else {
      // Default new-user role to the lowest-privilege role the actor can assign.
      const defaultRole: ManagedRole =
        assignableRoles[assignableRoles.length - 1] ?? 'AGENT';
      setForm({ ...EMPTY, role: defaultRole });
    }
  }, [open, user, assignableRoles]);

  const set = <K extends keyof FormState>(key: K) =>
    (value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  // The role dropdown shows roles the actor can assign, plus — when editing —
  // the target's current role (so we can render the row even if the actor
  // can't change it, e.g. ADMIN editing an AGENT only sees AGENT).
  const roleOptions: ManagedRole[] = useMemo(() => {
    const set = new Set<ManagedRole>(assignableRoles);
    if (user) set.add(user.role);
    return (['SUPER_ADMIN', 'ADMIN', 'AGENT'] as ManagedRole[]).filter((r) => set.has(r));
  }, [assignableRoles, user]);

  // Whether the role select should be disabled — true when the actor has
  // exactly one option AND it equals the current value (no real choice).
  const roleSelectDisabled =
    isSelf || (assignableRoles.length === 0) || (roleOptions.length <= 1);

  // Detect if this submission involves a SUPER_ADMIN promotion or demotion,
  // which requires an extra confirmation step per spec.
  const isSuperAdminPromotion =
    isEdit && user?.role !== 'SUPER_ADMIN' && form.role === 'SUPER_ADMIN';
  const isSuperAdminDemotion =
    isEdit && user?.role === 'SUPER_ADMIN' && form.role !== 'SUPER_ADMIN';
  const isCreatingSuperAdmin = !isEdit && form.role === 'SUPER_ADMIN';
  const requiresConfirmation =
    isSuperAdminPromotion || isSuperAdminDemotion || isCreatingSuperAdmin;

  const performSave = async () => {
    setLoading(true);
    setError('');
    try {
      if (isEdit) {
        await usersApi.update(user!.id, {
          name: form.name.trim(),
          role: form.role,
          isActive: form.isActive,
          password: form.password || undefined,
        });
      } else {
        const payload: CreateUserPayload = {
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          role: form.role,
          isActive: form.isActive,
        };
        await usersApi.create(payload);
      }
      onSuccess();
      onClose();
    } catch (e) {
      setError(extractApiError(e, 'Failed to save user'));
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  };

  const handleSubmit = () => {
    // Client-side validation mirrors backend rules so users see fast feedback.
    if (!form.name.trim()) return setError('Name is required');
    if (!form.email.trim()) return setError('Email is required');
    if (!isEdit && form.password.length < 8) {
      return setError('Password must be at least 8 characters');
    }
    if (isEdit && form.password && form.password.length < 8) {
      return setError('Password must be at least 8 characters (leave blank to keep current)');
    }

    if (requiresConfirmation) {
      setConfirmOpen(true);
      return;
    }
    void performSave();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-lg" data-testid="user-form-modal">
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit User' : 'Add New User'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {error && (
              <div
                className="flex items-start gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md"
                data-testid="user-form-error"
              >
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="uf-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="uf-name"
                value={form.name}
                onChange={(e) => set('name')(e.target.value)}
                placeholder="Priya Sharma"
                data-testid="user-name-input"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="uf-email">
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="uf-email"
                type="email"
                value={form.email}
                onChange={(e) => set('email')(e.target.value)}
                placeholder="priya@example.com"
                disabled={isEdit}
                data-testid="user-email-input"
              />
              {isEdit && (
                <p className="text-xs text-muted-foreground">
                  Email cannot be changed after creation.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="uf-password">
                {isEdit ? 'New Password' : (<>Password <span className="text-destructive">*</span></>)}
              </Label>
              <Input
                id="uf-password"
                type="password"
                value={form.password}
                onChange={(e) => set('password')(e.target.value)}
                placeholder={isEdit ? 'Leave blank to keep current' : 'At least 8 characters'}
                data-testid="user-password-input"
                autoComplete="new-password"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select
                  value={form.role}
                  onValueChange={(v) => set('role')(v as ManagedRole)}
                  disabled={roleSelectDisabled}
                >
                  <SelectTrigger data-testid="user-role-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((r) => (
                      <SelectItem
                        key={r}
                        value={r}
                        data-testid={`user-role-option-${r}`}
                      >
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isSelf && (
                  <p className="text-xs text-muted-foreground">You cannot change your own role.</p>
                )}
                {!isSelf && currentUser?.role === 'ADMIN' && (
                  <p className="text-xs text-muted-foreground">
                    Admins can manage Agent accounts only.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={form.isActive ? 'active' : 'disabled'}
                  onValueChange={(v) => set('isActive')(v === 'active')}
                  disabled={isSelf}
                >
                  <SelectTrigger data-testid="user-active-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
                {isSelf && (
                  <p className="text-xs text-muted-foreground">You cannot disable yourself.</p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={loading} data-testid="user-form-submit">
              {loading ? 'Saving...' : isEdit ? 'Update User' : 'Add User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog for SUPER_ADMIN role changes. */}
      <Dialog open={confirmOpen} onOpenChange={(o) => !loading && setConfirmOpen(o)}>
        <DialogContent className="max-w-md" data-testid="super-admin-confirm-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="text-amber-500" size={20} />
              {isSuperAdminDemotion ? 'Demote Super Admin?' : 'Grant Super Admin?'}
            </DialogTitle>
            <DialogDescription className="pt-2">
              {isSuperAdminDemotion ? (
                <>
                  You are about to demote <strong>{user?.name}</strong> from{' '}
                  <strong>Super Admin</strong> to <strong>{ROLE_LABELS[form.role]}</strong>.
                  They will lose owner-level controls including the ability to manage
                  other admins and system settings.
                </>
              ) : isSuperAdminPromotion ? (
                <>
                  You are about to promote <strong>{user?.name}</strong> to{' '}
                  <strong>Super Admin</strong>. They will gain full ownership of the
                  CRM, including the ability to create and demote admins.
                </>
              ) : (
                <>
                  You are about to create a new <strong>Super Admin</strong> account
                  for <strong>{form.name}</strong>. They will have full ownership of
                  the CRM, including the ability to create and demote admins.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={loading}
              data-testid="super-admin-confirm-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={performSave}
              disabled={loading}
              data-testid="super-admin-confirm-submit"
            >
              {loading ? 'Saving...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
