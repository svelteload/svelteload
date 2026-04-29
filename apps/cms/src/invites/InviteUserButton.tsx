'use client'

import React, { useState } from 'react'
import { useAuth } from '@payloadcms/ui'
import { getUserRole } from '@cms/access/roles'
import { InviteUserDialog } from './InviteUserDialog'

export default function InviteUserButton() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)

  if (getUserRole(user) !== 'admin') return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn--icon-style-without-border btn--size-small btn--withoutPopup btn--style-pill"
      >
        <span className="btn__content">
          <span className="btn__label">Invite user</span>
        </span>
      </button>
      {open && <InviteUserDialog onClose={() => setOpen(false)} />}
    </>
  )
}
