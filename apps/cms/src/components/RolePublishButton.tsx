'use client'

import React from 'react'
import { PublishButton, useAuth } from '@payloadcms/ui'
import { getUserRole } from '@cms/access/roles'

export default function RolePublishButton() {
  const { user } = useAuth()
  const role = getUserRole(user)
  if (role === 'contributor' || role === 'agent') return null
  return <PublishButton />
}
