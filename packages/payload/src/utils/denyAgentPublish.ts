import { APIError, type CollectionBeforeChangeHook } from 'payload'
import { isAgent } from '@cms/access/roles'
import { MCP_SCOPES, hasScope, mcpScopesFromRequest } from './mcpScopes'

export const denyAgentPublish: CollectionBeforeChangeHook = ({ data, req }) => {
    if (data?._status !== 'published') return data

    const scopes = mcpScopesFromRequest(req)

    if (scopes) {
        if (hasScope(scopes, MCP_SCOPES.contentPublish)) return data
        throw new APIError(
            'This connection cannot publish. Save the document as a draft, then publish it from the site once the change has been reviewed.',
            403,
            undefined,
            true,
        )
    }

    if (isAgent(req.user)) {
        throw new APIError(
            'Agent accounts cannot publish. Save the document as a draft, then publish it from the site once the change has been reviewed.',
            403,
            undefined,
            true,
        )
    }

    return data
}
