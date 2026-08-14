import type { Access, FieldAccess, CollectionConfig, GlobalConfig } from 'payload'
import { MCP_SCOPES, mcpScopesFromRequest } from '@svelteload/payload/utils/mcpScopes'

export type UserRole = 'admin' | 'agent' | 'editor' | 'contributor' | 'reader'

const ROLE_ORDER: UserRole[] = ['reader', 'contributor', 'editor', 'agent', 'admin']

export function getUserRole(user: unknown): UserRole | null {
  if (!user || typeof user !== 'object' || !('role' in user)) return null
  const role = (user as { role?: unknown }).role
  if (typeof role !== 'string') return null
  return (ROLE_ORDER as string[]).includes(role) ? (role as UserRole) : null
}

const rank = (role: UserRole | null): number =>
  role === null ? -1 : ROLE_ORDER.indexOf(role)

export const minRole = (min: UserRole): Access => ({ req }) =>
  rank(getUserRole(req.user)) >= rank(min)

export const minRoleField = (min: UserRole): FieldAccess => ({ req }) =>
  rank(getUserRole(req.user)) >= rank(min)

export const isAgent = (user: unknown): boolean => getUserRole(user) === 'agent'

export const denyAgents: Access = ({ req }) => !isAgent(req.user)

const allOf = (...checks: Access[]): Access => async (args) => {
  for (const check of checks) {
    if ((await check(args)) !== true) return false
  }
  return true
}

export const mcpRequiresScope = (scope: string): Access => ({ req }) => {
  const scopes = mcpScopesFromRequest(req)
  if (!scopes) return true
  return scopes.includes(scope)
}


type Tier = 'editor' | 'internal' | 'agent' | 'admin'

const COLLECTION_TIERS: Record<Tier, NonNullable<CollectionConfig['access']>> = {
  editor: {
    read: () => true,
    create: minRole('contributor'),
    update: minRole('contributor'),
    delete: allOf(minRole('contributor'), denyAgents, mcpRequiresScope(MCP_SCOPES.contentDelete)),
  },
  internal: {
    read: minRole('reader'),
    create: minRole('contributor'),
    update: minRole('contributor'),
    delete: allOf(minRole('contributor'), denyAgents, mcpRequiresScope(MCP_SCOPES.contentDelete)),
  },
  agent: {
    read: minRole('agent'),
    create: minRole('admin'),
    update: minRole('admin'),
    delete: minRole('admin'),
  },
  admin: {
    read: minRole('admin'),
    create: minRole('admin'),
    update: minRole('admin'),
    delete: minRole('admin'),
  },
}

const GLOBAL_TIERS: Record<Tier, NonNullable<GlobalConfig['access']>> = {
  editor:   { read: () => true,         update: allOf(minRole('contributor'), mcpRequiresScope(MCP_SCOPES.globalsWrite)) },
  internal: { read: minRole('reader'),  update: allOf(minRole('contributor'), mcpRequiresScope(MCP_SCOPES.globalsWrite)) },
  agent:    { read: minRole('agent'),   update: minRole('admin') },
  admin:    { read: minRole('admin'),   update: minRole('admin') },
}

export const setAccess = (tier: Tier) => COLLECTION_TIERS[tier]
export const setGlobalAccess = (tier: Tier) => GLOBAL_TIERS[tier]

export const adminOrSelf: Access = ({ req, id }) => {
  if (!req.user) return false
  const role = getUserRole(req.user)
  if (role === 'admin' || role === 'agent') return true
  if (id && req.user.id === id) return true
  return { id: { equals: req.user.id } }
}
