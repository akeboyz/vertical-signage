import { useState, useCallback } from 'react'
import { Stack, Button, Spinner, Flex, Text, Card, Badge } from '@sanity/ui'
import { set, useClient } from 'sanity'
import type { StringInputProps } from 'sanity'
import { useFormValue } from 'sanity'

const TRANSLATE_API_URL =
  process.env.SANITY_STUDIO_TRANSLATE_API_URL ??
  'https://aquamx-handoff.netlify.app/api/translate'

/**
 * Custom input for `legalName_th` on Party documents.
 *
 * Extends the standard string input with two buttons:
 *
 *  ✨ Translate from English  — AI-translates from legalName_en
 *  🏛️ Generate Juristic Names — generates BOTH legalName_th and legalName_en
 *      from the first linked project site using the formula:
 *        TH: "นิติบุคคลอาคารชุด " + projectTh
 *        EN: projectEn + " Condominium Juristic Person"
 *
 *  Generate button is disabled unless:
 *    • partyRole includes 'juristicPerson'
 *    • at least one project site is linked in projectSites
 */
export function JuristicNameTHInput(props: StringInputProps) {
  const client = useClient({ apiVersion: '2024-01-01' })

  const docId        = useFormValue(['_id'])        as string | undefined
  const partyRole    = useFormValue(['partyRole'])   as string[] | undefined
  const projectSites = useFormValue(['projectSites']) as { _ref: string }[] | undefined
  const legalNameEn  = useFormValue(['legalName_en']) as string | undefined

  const isJuristic   = (partyRole ?? []).includes('juristicPerson')
  const firstSiteRef = projectSites?.[0]?._ref
  const canGenerate  = isJuristic && !!firstSiteRef

  // ── Translate state ─────────────────────────────────────────────────────────
  const [translating, setTranslating] = useState(false)
  const [transError,  setTransError]  = useState('')

  // ── Generate state ──────────────────────────────────────────────────────────
  const [generating,  setGenerating]  = useState(false)
  const [genPreview,  setGenPreview]  = useState<{ th: string; en: string } | null>(null)
  const [applying,    setApplying]    = useState(false)
  const [genError,    setGenError]    = useState('')

  // ── Translate from English ─────────────────────────────────────────────────
  const handleTranslate = useCallback(async () => {
    if (!legalNameEn?.trim()) return
    setTranslating(true)
    setTransError('')
    try {
      const res  = await fetch(TRANSLATE_API_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: legalNameEn, sourceLang: 'English', targetLang: 'Thai' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      props.onChange(set(data.translated))
    } catch (err: any) {
      setTransError(err?.message ?? 'Translation failed')
    } finally {
      setTranslating(false)
    }
  }, [legalNameEn, props])

  // ── Generate juristic names ────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!firstSiteRef) return
    setGenerating(true)
    setGenError('')
    setGenPreview(null)
    try {
      const site = await client.fetch<{ projectTh?: string; projectEn?: string }>(
        `*[_id == $id][0]{ projectTh, projectEn }`,
        { id: firstSiteRef },
      )
      const thName = site?.projectTh
        ? `นิติบุคคลอาคารชุด ${site.projectTh}`
        : null
      const enName = site?.projectEn
        ? `${site.projectEn} Condominium Juristic Person`
        : null

      if (!thName && !enName) throw new Error('Project site has no name filled in yet.')
      setGenPreview({ th: thName ?? '', en: enName ?? '' })
    } catch (err: any) {
      setGenError(err?.message ?? 'Failed to load project site')
    } finally {
      setGenerating(false)
    }
  }, [client, firstSiteRef])

  // ── Apply generated names ──────────────────────────────────────────────────
  const handleApply = useCallback(async () => {
    if (!genPreview || !docId) return
    setApplying(true)
    setGenError('')
    try {
      const patch: Record<string, string> = {}
      if (genPreview.th) patch.legalName_th = genPreview.th
      if (genPreview.en) patch.legalName_en = genPreview.en

      // Patch the document the user is currently editing (draft or published).
      // Using docId directly (may be "drafts.xxx") so the change is visible
      // immediately in the form without requiring a page reload.
      await client.patch(docId).set(patch).commit({ autoGenerateArrayKeys: true })

      // Update the current field locally so it reflects immediately
      if (genPreview.th) props.onChange(set(genPreview.th))
      setGenPreview(null)
    } catch (err: any) {
      setGenError(err?.message ?? 'Failed to apply names')
    } finally {
      setApplying(false)
    }
  }, [client, docId, genPreview, props])

  const generateTitle = !isJuristic
    ? 'Select "Juristic Person" role first'
    : !firstSiteRef
      ? 'Link a Project Site first'
      : 'Generate both Thai and English juristic names from the linked project site'

  return (
    <Stack space={2}>
      {props.renderDefault(props)}

      {/* ── Preview card ────────────────────────────────────────────────── */}
      {genPreview && (
        <Card padding={3} radius={2} tone="primary" border>
          <Stack space={3}>
            <Text size={0} muted weight="semibold">Generated names — please verify:</Text>
            <Stack space={2}>
              {genPreview.th && (
                <Flex gap={2} align="center">
                  <Badge tone="primary" fontSize={0} style={{ flexShrink: 0 }}>TH</Badge>
                  <Text size={1} weight="semibold">{genPreview.th}</Text>
                </Flex>
              )}
              {genPreview.en && (
                <Flex gap={2} align="center">
                  <Badge tone="default" fontSize={0} style={{ flexShrink: 0 }}>EN</Badge>
                  <Text size={1}>{genPreview.en}</Text>
                </Flex>
              )}
            </Stack>
            <Flex gap={2}>
              {applying ? (
                <Flex gap={2} align="center"><Spinner muted /><Text size={1} muted>Applying…</Text></Flex>
              ) : (
                <Button text="Apply both" tone="primary" fontSize={1} padding={2} onClick={handleApply} />
              )}
              <Button text="Dismiss" mode="ghost" fontSize={1} padding={2} onClick={() => setGenPreview(null)} />
            </Flex>
          </Stack>
        </Card>
      )}

      {/* ── Buttons row ─────────────────────────────────────────────────── */}
      <Flex gap={2} wrap="wrap" align="center">

        {/* Translate from English */}
        {translating ? (
          <Flex gap={2} align="center"><Spinner muted /><Text size={1} muted>Translating…</Text></Flex>
        ) : (
          <Button
            text="✨ Translate from English"
            mode="ghost"
            tone="primary"
            fontSize={1}
            padding={2}
            disabled={!legalNameEn?.trim()}
            title={legalNameEn?.trim() ? 'Translate from English legal name' : 'Fill in Legal Name (English) first'}
            onClick={handleTranslate}
          />
        )}

        {/* Generate Juristic Names */}
        {generating ? (
          <Flex gap={2} align="center"><Spinner muted /><Text size={1} muted>Loading project…</Text></Flex>
        ) : (
          <Button
            text="🏛️ Generate Juristic Names"
            mode="ghost"
            tone={canGenerate ? 'caution' : 'default'}
            fontSize={1}
            padding={2}
            disabled={!canGenerate}
            title={generateTitle}
            onClick={handleGenerate}
          />
        )}
      </Flex>

      {transError && <Text size={0} style={{ color: '#e05252' }}>{transError}</Text>}
      {genError   && <Text size={0} style={{ color: '#e05252' }}>{genError}</Text>}
    </Stack>
  )
}
