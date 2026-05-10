/**
 * accessControl plugin
 *
 * Loads the studioAccess config document from Sanity on startup and caches
 * it in a module-level store. The structure builder reads from this cache
 * to filter the navigation items per user.
 *
 * The config re-loads whenever the Studio is opened or the page is refreshed.
 */

import { definePlugin }     from 'sanity'
import { useEffect, useRef } from 'react'
import { useClient }         from 'sanity'

interface UserPermission {
  userEmail:      string
  allowedSchemas: string[]
}

// ── Module-level cache ────────────────────────────────────────────────────────

export const accessStore = {
  loaded: false,
  /** email (lowercase) → array of allowed schema section IDs */
  config: {} as Record<string, string[]>,
}

// ── Loader component (rendered invisibly inside the Studio layout) ────────────

function AccessConfigLoader() {
  const client  = useClient({ apiVersion: '2024-01-01' })
  const fetched = useRef(false)

  useEffect(() => {
    if (fetched.current) return
    fetched.current = true

    client
      .fetch<UserPermission[]>('*[_type == "studioAccess"][0].userPermissions')
      .then(perms => {
        const map: Record<string, string[]> = {}
        for (const p of (perms ?? [])) {
          if (p?.userEmail) {
            map[p.userEmail.toLowerCase()] = p.allowedSchemas ?? []
          }
        }
        accessStore.config = map
        accessStore.loaded = true
      })
      .catch(() => {
        // On error, treat as "no restrictions" so admins aren't locked out
        accessStore.loaded = true
      })
  }, [client])

  return null
}

// ── Plugin definition ─────────────────────────────────────────────────────────

export const accessControlPlugin = definePlugin({
  name: 'studio-access-control',
  studio: {
    components: {
      layout: ({ renderDefault, ...props }: any) => (
        <>
          <AccessConfigLoader />
          {renderDefault(props)}
        </>
      ),
    },
  },
})
