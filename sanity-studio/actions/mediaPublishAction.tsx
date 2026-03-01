import { useState } from 'react'
import { useDocumentOperation, useClient } from 'sanity'
import type { DocumentActionProps } from 'sanity'

type SlotResult = { projectId: string; ok: boolean; text: string }

/**
 * Replaces the default Publish action on Media documents.
 *
 * Extra behaviour — when addToPlaylistOnPublish==true (any kind):
 *
 *   kind="notice"   → targets = media.projects[] (scope field is hidden for notices)
 *   scope="project" → targets = media.projects[]
 *   scope="global"  → targets = all active projects MINUS media.excludedProjects[]
 *                     (if excludedProjects is empty, all active projects are targeted)
 *
 * No post-publish picker. Target projects are pre-configured in the form.
 * A result dialog is shown only when errors/duplicates occur; pure success is silent.
 */
export function MediaPublishAction(props: DocumentActionProps) {
  const { publish } = useDocumentOperation(props.id, props.type)
  const client      = useClient({ apiVersion: '2024-01-01' })

  const [busy,    setBusy]    = useState(false)
  const [open,    setOpen]    = useState(false)
  const [results, setResults] = useState<SlotResult[]>([])

  // Read from draft (current editing state).
  const doc             = (props.draft ?? props.published) as Record<string, any> | null
  const kind            = doc?.kind             as string | undefined
  const scope           = doc?.scope            as string | undefined
  const docProjs        = (doc?.projects        ?? []) as Array<{ _ref: string }>
  const excludedProjs   = (doc?.excludedProjects ?? []) as Array<{ _ref: string }>
  const addOnPub        = !!(doc?.addToPlaylistOnPublish)

  // ── Resolve target project refs ────────────────────────────────────────────
  // Notices: scope field is hidden in the form and defaults to 'global', which
  // would wrongly target every active project. Use projects[] directly instead.
  async function resolveTargets(): Promise<string[]> {
    if (kind === 'notice' || scope === 'project') {
      return docProjs.map(p => p._ref)
    }
    if (scope === 'global') {
      const allIds = await client.fetch<string[]>(
        `*[_type == "project" && isActive == true]._id`,
        {}
      )
      const excludedIds = new Set(excludedProjs.map(p => p._ref))
      return allIds.filter(id => !excludedIds.has(id))
    }
    return []
  }

  // ── Create one slot, return result ─────────────────────────────────────────
  async function createSlot(projectId: string): Promise<SlotResult> {
    try {
      const dup = await client.fetch<string | null>(
        `*[_type == "playlistItem" && media._ref == $m && project._ref == $p][0]._id`,
        { m: props.id, p: projectId }
      )
      if (dup) {
        return { projectId, ok: false, text: 'Slot already exists — skipped.' }
      }

      const orders = await client.fetch<number[]>(
        `*[_type == "playlistItem" && project._ref == $p].order`,
        { p: projectId }
      )
      const next = (orders.length ? Math.max(...orders) : 0) + 10

      await client.create({
        _id:     `drafts.${crypto.randomUUID()}`,
        _type:   'playlistItem',
        project: { _type: 'reference', _ref: projectId },
        media:   { _type: 'reference', _ref: props.id },
        order:   next,
        enabled: true,
      })
      return { projectId, ok: true, text: `Slot created at order ${next}.` }
    } catch (err: any) {
      return { projectId, ok: false, text: err?.message ?? String(err) }
    }
  }

  // ── Main handler ───────────────────────────────────────────────────────────
  async function onHandle() {
    setBusy(true)
    publish.execute()

    if (!addOnPub) {
      setBusy(false)
      props.onComplete()
      return
    }

    await new Promise(r => setTimeout(r, 800))

    const targets = await resolveTargets()
    if (targets.length === 0) {
      setBusy(false)
      props.onComplete()
      return
    }

    const slotResults: SlotResult[] = []
    for (const id of targets) {
      slotResults.push(await createSlot(id))
    }

    setBusy(false)

    if (slotResults.some(r => !r.ok)) {
      setResults(slotResults)
      setOpen(true)
    } else {
      props.onComplete()
    }
  }

  return {
    label:    busy ? 'Publishing…' : 'Publish',
    tone:     'positive' as const,
    disabled: !!publish.disabled || busy,

    onHandle,

    dialog: open ? {
      type:   'dialog' as const,
      id:     'media-publish-result',
      header: 'Published — Playlist Slot Results',
      onClose: () => {
        setOpen(false)
        setResults([])
        props.onComplete()
      },
      content: (
        <div style={{ padding: '1.5rem', minWidth: 300, maxWidth: 480 }}>
          <p style={{ marginBottom: '1rem', fontWeight: 600 }}>
            Media published. Playlist slot results:
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {results.map((r, i) => (
              <li key={i} style={{ color: r.ok ? 'green' : 'crimson', fontSize: '0.9em' }}>
                {r.ok ? '✓' : '✗'} [{r.projectId.slice(-6)}] {r.text}
              </li>
            ))}
          </ul>
          <p style={{ marginTop: '1rem', fontSize: '0.82em', color: '#666' }}>
            Go to <strong>Playlist Items</strong> to publish newly created slots.
          </p>
        </div>
      ),
    } : undefined,
  }
}
