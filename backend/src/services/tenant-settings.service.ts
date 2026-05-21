/**
 * Singleton tenant-wide settings.
 *
 * There is exactly one row at id="default". Reads upsert-on-miss so callers
 * never have to seed it explicitly.
 *
 * The two flags persisted here (`autoAssignLeadsEnabled`,
 * `agentVisibilityMode`) are NOT yet wired into the Leads workflow — the UI
 * surface labels them as "Saved — activation in future workflow phase" so the
 * behaviour is transparent.
 */
import { prisma } from '../lib/prisma';

const SINGLETON_ID = 'default';

export type AgentVisibilityMode = 'OWN_ONLY' | 'ALL';

export interface TenantSettingsDto {
  autoAssignLeadsEnabled: boolean;
  agentVisibilityMode: AgentVisibilityMode;
  updatedAt: Date;
  updatedBy: { id: string; name: string } | null;
}

type Row = {
  autoAssignLeadsEnabled: boolean;
  agentVisibilityMode: string;
  updatedAt: Date;
  updatedBy: { id: string; name: string } | null;
};

function toDto(row: Row): TenantSettingsDto {
  return {
    autoAssignLeadsEnabled: row.autoAssignLeadsEnabled,
    agentVisibilityMode: (row.agentVisibilityMode === 'ALL'
      ? 'ALL'
      : 'OWN_ONLY') as AgentVisibilityMode,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}

export async function getTenantSettings(): Promise<TenantSettingsDto> {
  const row = await prisma.tenantSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
    include: { updatedBy: { select: { id: true, name: true } } },
  });
  return toDto(row);
}

export interface UpdateTenantSettingsInput {
  autoAssignLeadsEnabled?: boolean;
  agentVisibilityMode?: AgentVisibilityMode;
}

export async function updateTenantSettings(
  actorUserId: string,
  input: UpdateTenantSettingsInput,
): Promise<TenantSettingsDto> {
  const data: {
    autoAssignLeadsEnabled?: boolean;
    agentVisibilityMode?: string;
    updatedById: string;
  } = { updatedById: actorUserId };

  if (typeof input.autoAssignLeadsEnabled === 'boolean') {
    data.autoAssignLeadsEnabled = input.autoAssignLeadsEnabled;
  }
  if (input.agentVisibilityMode === 'OWN_ONLY' || input.agentVisibilityMode === 'ALL') {
    data.agentVisibilityMode = input.agentVisibilityMode;
  }

  const row = await prisma.tenantSettings.upsert({
    where: { id: SINGLETON_ID },
    update: data,
    create: { id: SINGLETON_ID, ...data },
    include: { updatedBy: { select: { id: true, name: true } } },
  });
  return toDto(row);
}
