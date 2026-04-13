/**
 * ProtectedProjectDeleteAction
 *
 * Replaces the default delete action on `project` documents.
 * If the project is marked active (isActive: true), deletion is blocked
 * with a tooltip explaining why. The user must uncheck isActive first.
 */

import { TrashIcon }         from '@sanity/icons'
import { useState }          from 'react'
import { DocumentActionProps, useDocumentOperation } from 'sanity'

export function ProtectedProjectDeleteAction(props: DocumentActionProps) {
  const isActive = (props.published as any)?.isActive as boolean | undefined
  const { delete: deleteOp } = useDocumentOperation(props.id, props.type)

  // Block deletion while project is active / deployed
  if (isActive) {
    return {
      label:    'Delete',
      icon:     TrashIcon,
      disabled: true,
      title:    'Project is active and deployed. Uncheck "Is Active" before deleting.',
    }
  }

  return {
    label:    'Delete',
    icon:     TrashIcon,
    tone:     'critical' as const,
    onHandle: () => {
      deleteOp.execute()
      props.onComplete()
    },
  }
}
