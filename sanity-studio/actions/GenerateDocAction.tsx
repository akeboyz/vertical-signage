'use client'

import { useState }                              from 'react'
import type { DocumentActionComponent, DocumentActionProps } from 'sanity'
import { useToast }                              from '@sanity/ui'

/**
 * GenerateDocAction — custom Sanity Studio document action for the "contract" type.
 *
 * When clicked it calls the backend /api/generate-contract endpoint, which:
 *  1. Fetches the contract + linked projectSite from Sanity
 *  2. Copies the Google Docs template
 *  3. Replaces {{placeholders}} with field values
 *  4. Exports a PDF and uploads it to Sanity Assets
 *  5. Writes back generatedGoogleDocId, generatedGoogleDocUrl,
 *     generatedPdfAsset, generatedAt, generationStatus into the document
 *
 * Set SANITY_STUDIO_GENERATE_API_URL in your .env to override the endpoint.
 */
const API_URL =
  process.env.SANITY_STUDIO_GENERATE_API_URL ??
  'https://aquamx-handoff.netlify.app/api/generate-contract'

export const GenerateDocAction: DocumentActionComponent = (props: DocumentActionProps) => {
  const [isGenerating, setIsGenerating] = useState(false)
  const toast = useToast()

  // The document must be published (no draft) before generating
  const isPublished = !props.id.startsWith('drafts.')
  const hasDraft    = props.draft !== null

  return {
    label:    isGenerating ? 'Generating…' : '📄 Generate Doc',
    tone:     'primary',
    disabled: isGenerating || !isPublished,
    title:    hasDraft
      ? 'Publish the document first before generating'
      : !isPublished
        ? 'Document must be published'
        : 'Generate Google Doc + PDF from this contract',

    onHandle: async () => {
      setIsGenerating(true)
      try {
        const res = await fetch(API_URL, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ documentId: props.id }),
        })

        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error ?? `HTTP ${res.status}`)
        }

        toast.push({
          status:      'success',
          title:       'Document generated!',
          description: 'Google Doc and PDF are ready. Click the "Generated Documents" tab to see links.',
          duration:    6000,
        })

        // Close the action dialog (if any) and trigger a document re-fetch
        props.onComplete()

      } catch (err: any) {
        console.error('[GenerateDocAction]', err)
        toast.push({
          status:      'error',
          title:       'Generation failed',
          description: err?.message ?? 'Unknown error. Check console for details.',
          duration:    8000,
        })
      } finally {
        setIsGenerating(false)
      }
    },
  }
}
