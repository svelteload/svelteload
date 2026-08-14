import { APIError, type CollectionBeforeChangeHook } from 'payload'
import { isAgent } from '@cms/access/roles'

export const denyAgentPublish: CollectionBeforeChangeHook = ({ data, req }) => {
    if (data?._status !== 'published') return data
    if (!isAgent(req.user)) return data

    throw new APIError(
        'Agent accounts cannot publish. Save the document as a draft, then publish it from the site once the change has been reviewed.',
        403,
        undefined,
        true,
    )
}
