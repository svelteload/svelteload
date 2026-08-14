export const MCP_SCOPES = {
    contentRead: 'content:read',
    contentWrite: 'content:write',
    mediaWrite: 'media:write',
    globalsWrite: 'globals:write',
    contentPublish: 'content:publish',
    contentDelete: 'content:delete',
} as const

export type McpScope = (typeof MCP_SCOPES)[keyof typeof MCP_SCOPES]

export const ALL_SCOPES = Object.values(MCP_SCOPES) as McpScope[]

const CLIENT_PROFILE: McpScope[] = [MCP_SCOPES.contentRead, MCP_SCOPES.contentWrite, MCP_SCOPES.mediaWrite]

const OPERATOR_PROFILE: McpScope[] = [
    MCP_SCOPES.contentRead,
    MCP_SCOPES.contentWrite,
    MCP_SCOPES.mediaWrite,
    MCP_SCOPES.globalsWrite,
]

export const grantableScopesForRole = (role: string | null | undefined): McpScope[] =>
    role === 'admin' || role === 'agent' ? OPERATOR_PROFILE : CLIENT_PROFILE

export const parseScopeString = (raw: string | null | undefined): McpScope[] => {
    if (!raw) return []
    const requested = raw.split(/\s+/).filter(Boolean)
    return ALL_SCOPES.filter((scope) => requested.includes(scope))
}

export const narrowToGrantable = (requested: McpScope[], role: string | null | undefined): McpScope[] => {
    const allowed = grantableScopesForRole(role)
    const narrowed = requested.filter((scope) => allowed.includes(scope))
    return narrowed.length ? narrowed : allowed
}

export const hasScope = (scopes: readonly string[] | undefined | null, scope: McpScope): boolean =>
    Array.isArray(scopes) && scopes.includes(scope)

export const mcpScopesFromRequest = (req: unknown): string[] | null => {
    const context = (req as { context?: { mcpScopes?: unknown } } | undefined)?.context
    return Array.isArray(context?.mcpScopes) ? (context.mcpScopes as string[]) : null
}
