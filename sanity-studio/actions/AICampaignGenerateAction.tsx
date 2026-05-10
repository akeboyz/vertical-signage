import { useState } from 'react'
import { useDocumentOperation, useClient } from 'sanity'
import type { DocumentActionProps } from 'sanity'

const API_BASE = (typeof process !== 'undefined' && (process.env as any).SANITY_STUDIO_API_BASE_URL)
  || 'https://aquamx-handoff.netlify.app'

/**
 * "✨ AI Generate" action on emailCampaign documents.
 *
 * Reads the aiBrief field, calls /api/ai-campaign on the handoff backend,
 * then patches subject / body_en / body_th / imageSuggestions back into the draft.
 */
export function AICampaignGenerateAction(props: DocumentActionProps) {
  const { patch }  = useDocumentOperation(props.id, props.type)
  const client     = useClient({ apiVersion: '2024-01-01' })

  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [msg,  setMsg]  = useState('')
  const [ok,   setOk]   = useState(false)

  const doc           = (props.draft ?? props.published) as Record<string, any> | null
  const aiBrief       = doc?.aiBrief       as string | undefined
  const campaignTitle = doc?.title         as string | undefined
  const bizCategory   = doc?.businessCategory as string | undefined

  async function onHandle() {
    if (!aiBrief?.trim()) {
      setMsg('Please fill in the Campaign Brief first (✨ AI Assist tab).')
      setOk(false)
      setOpen(true)
      return
    }

    setBusy(true)
    try {
      const res = await fetch(`${API_BASE}/api/ai-campaign`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          brief:            aiBrief,
          campaignTitle:    campaignTitle ?? '',
          businessCategory: bizCategory   ?? '',
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error ?? `HTTP ${res.status}`)
      }

      // Write results back to the draft document
      patch.execute([
        {
          set: {
            subject:          data.subject          ?? '',
            body_en:          data.body_en          ?? '',
            body_th:          data.body_th          ?? '',
            imageSuggestions: data.imageSuggestions ?? '',
          },
        },
      ])

      setMsg('Content generated! Review the ✉️ Content tab — edit as needed before sending.')
      setOk(true)
      setOpen(true)

    } catch (err: any) {
      setMsg(`Generation failed: ${err?.message ?? String(err)}`)
      setOk(false)
      setOpen(true)
    } finally {
      setBusy(false)
    }
  }

  return {
    label:    busy ? 'Generating…' : '✨ AI Generate',
    tone:     'primary' as const,
    disabled: busy,

    onHandle,

    dialog: open ? {
      type:    'dialog' as const,
      id:      'ai-campaign-result',
      header:  ok ? '✨ Content Generated' : 'AI Generate — Error',
      onClose: () => {
        setOpen(false)
        if (ok) props.onComplete()
      },
      content: (
        <div style={{ padding: '1.5rem', minWidth: 300, maxWidth: 480 }}>
          <p style={{ color: ok ? 'green' : 'crimson', margin: 0 }}>{msg}</p>
          {ok && (
            <p style={{ marginTop: '0.75rem', fontSize: '0.85em', color: '#666' }}>
              Remember to <strong>publish</strong> the campaign document after reviewing.
            </p>
          )}
        </div>
      ),
    } : undefined,
  }
}
