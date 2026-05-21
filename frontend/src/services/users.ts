import api from './api';

export type ManagedRole = 'SUPER_ADMIN' | 'ADMIN' | 'AGENT';

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: ManagedRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserListParams {
  search?: string;
  role?: ManagedRole | 'ALL';
  isActive?: 'true' | 'false' | 'ALL';
}

export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  role: ManagedRole;
  isActive?: boolean;
}

export interface UpdateUserPayload {
  name?: string;
  role?: ManagedRole;
  isActive?: boolean;
  password?: string;
}

export const usersApi = {
  list: (params: UserListParams = {}) => {
    const query: Record<string, string> = {};
    if (params.search?.trim()) query.search = params.search.trim();
    if (params.role && params.role !== 'ALL') query.role = params.role;
    if (params.isActive && params.isActive !== 'ALL') query.isActive = params.isActive;
    return api.get<ManagedUser[]>('/users', { params: query }).then((r) => r.data);
  },

  create: (payload: CreateUserPayload) =>
    api.post<ManagedUser>('/users', payload).then((r) => r.data),

  update: (id: string, payload: UpdateUserPayload) =>
    api.put<ManagedUser>(`/users/${id}`, payload).then((r) => r.data),
};

/**
 * Returns the set of roles the actor (logged-in user) can assign when
 * creating or editing another user. Mirrors `rolesActorCanAssign` on the
 * backend so the UI shows exactly the same options the API would accept.
 */
export function rolesActorCanAssign(actorRole?: string): ManagedRole[] {
  if (actorRole === 'SUPER_ADMIN') return ['SUPER_ADMIN', 'ADMIN', 'AGENT'];
  if (actorRole === 'ADMIN') return ['AGENT'];
  return [];
}

export const ROLE_LABELS: Record<ManagedRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  AGENT: 'Agent',
};
