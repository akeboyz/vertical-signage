import { useState, useCallback, useRef } from 'react'
import {
  Stack, Text, Card, Flex, Button, Spinner, Badge,
  TextInput, Box,
} from '@sanity/ui'
import { useClient } from 'sanity'
import type { DocumentActionProps, DocumentActionDescription } from 'sanity'

interface ContractResult {
  _id:            string
  quotationNumber?: string
  contractNumber?:  string
  customerName?:    string
  legalName_th?:    string
  legalName_en?:    string
  projectEn?:       string
}

/**
 * Document Action on Party documents.
 * Opens a contract search dialog, lets user pick a contract,
 * then imports customer name info into the Party fields.
 */
export function ImportFromContractAction(
  props: DocumentActionProps,
): DocumentActionDescription {
  const client = useClient({ apiVersion: '2024-01-01' })

  const [open,      setOpen]      = useState(false)
  const [query,     setQuery]     = useState('')
  const [results,   setResults]   = useState<ContractResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected,  setSelected]  = useState<ContractResult | null>(null)
  const [applying,  setApplying]  = useState(false)
  const [done,      setDone]      = useState(false)
  const [error,     setError]     = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleClose = useCallback(() => {
    setOpen(false)
    setQuery('')
    setResults([])
    setSelected(null)
    setDone(false)
    setError('')
    if (done) props.onComplete()
  }, [done, props])

  const handleSearch = useCallback((value: string) => {
    setQuery(value)
    setSelected(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim()) { setResults([]); return }

    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const q = value.trim()
        const hits = await client.fetch<ContractResult[]>(
          `*[_type == "contract" && (
            customerName match $q + "*" ||
            quotationNumber match $q + "*" ||
            contractNumber  match $q + "*" ||
            party->legalName_th match $q + "*"
          )][0...10]{
            _id,
            quotationNumber,
            contractNumber,
            customerName,
            "legalName_th": coalesce(party->legalName_th, party->legalName),
            "legalName_en": party->legalName_en,
            "projectEn":    projectSite->projectEn
          }`,
          { q },
        )
        setResults(hits ?? [])
      } catch (err: any) {
        setError(err?.message ?? 'Search failed')
      } finally {
        setSearching(false)
      }
    }, 350)
  }, [client])

  const handleApply = useCallback(async () => {
    if (!selected) return
    setApplying(true)
    setError('')
    try {
      // Derive the best name: prefer party legalName_th, fall back to customerName
      const legalNameTh = selected.legalName_th || selected.customerName || ''
      const legalNameEn = selected.legalName_en || ''

      const baseId = props.id.replace(/^drafts\./, '')

      const patchFields: Record<string, unknown> = {}
      if (legalNameTh) patchFields.legalName_th = legalNameTh
      if (legalNameEn) patchFields.legalName_en = legalNameEn

      await client
        .patch(baseId)
        .set(patchFields)
        .setIfMissing({ partyRole: ['juristicPerson'], identityType: 'corporate' })
        .commit({ autoGenerateArrayKeys: true })
      setDone(true)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to apply data')
    } finally {
      setApplying(false)
    }
  }, [client, selected, props.id])

  return {
    label:    'Import from Contract',
    onHandle: () => setOpen(true),

    dialog: open
      ? {
          type:    'dialog',
          header:  'Import Party Info from Contract',
          onClose: handleClose,
          content: (
            <Stack space={4} padding={4}>

              {done ? (
                // ── Success ────────────────────────────────────────────────
                <>
                  <Card padding={3} border radius={2} tone="positive">
                    <Stack space={2}>
                      <Text size={1} weight="semibold">✓ Party info imported</Text>
                      <Text size={1} muted>
                        Legal name has been filled in. You can now complete the
                        remaining fields (contact info, roles, etc.).
                      </Text>
                    </Stack>
                  </Card>
                  <Flex justify="flex-end">
                    <Button text="Done" tone="primary" onClick={handleClose} />
                  </Flex>
                </>
              ) : selected ? (
                // ── Confirm preview ────────────────────────────────────────
                <>
                  <Text size={1} muted>The following will be applied to this Party:</Text>

                  <Card padding={3} border radius={2} tone="primary">
                    <Stack space={2}>
                      {(selected.legalName_th || selected.customerName) && (
                        <Flex gap={2} align="center">
                          <Badge tone="primary" fontSize={0} style={{ flexShrink: 0 }}>Legal Name (TH)</Badge>
                          <Text size={1} weight="semibold">
                            {selected.legalName_th || selected.customerName}
                          </Text>
                        </Flex>
                      )}
                      {selected.legalName_en && (
                        <Flex gap={2} align="center">
                          <Badge tone="default" fontSize={0} style={{ flexShrink: 0 }}>Legal Name (EN)</Badge>
                          <Text size={1}>{selected.legalName_en}</Text>
                        </Flex>
                      )}
                      <Flex gap={2} align="center">
                        <Badge tone="default" fontSize={0} style={{ flexShrink: 0 }}>Role (if not set)</Badge>
                        <Text size={1}>🏛️ Juristic Person</Text>
                      </Flex>
                      <Flex gap={2} align="center">
                        <Badge tone="default" fontSize={0} style={{ flexShrink: 0 }}>Source</Badge>
                        <Text size={1} muted>
                          {selected.contractNumber ?? selected.quotationNumber ?? selected._id}
                          {selected.projectEn ? ` — ${selected.projectEn}` : ''}
                        </Text>
                      </Flex>
                    </Stack>
                  </Card>

                  <Text size={0} muted>
                    Only empty fields will be set for Role. Legal name will always be overwritten.
                  </Text>

                  {error && (
                    <Card padding={3} border radius={2} tone="critical">
                      <Text size={1}>{error}</Text>
                    </Card>
                  )}

                  <Flex gap={3} justify="flex-end">
                    <Button
                      text="← Back"
                      mode="ghost"
                      onClick={() => setSelected(null)}
                      disabled={applying}
                    />
                    {applying ? (
                      <Flex gap={2} align="center">
                        <Spinner muted />
                        <Text size={1} muted>Applying…</Text>
                      </Flex>
                    ) : (
                      <Button
                        text="Apply to Party"
                        tone="primary"
                        onClick={handleApply}
                      />
                    )}
                  </Flex>
                </>
              ) : (
                // ── Search ─────────────────────────────────────────────────
                <>
                  <Text size={1} muted>
                    Search by customer name, quotation number, or contract number:
                  </Text>

                  <TextInput
                    value={query}
                    onChange={e => handleSearch((e.target as HTMLInputElement).value)}
                    placeholder="e.g. นิติบุคคล, QT-2024, CT-2024…"
                    autoFocus
                  />

                  {searching && (
                    <Flex gap={2} align="center">
                      <Spinner muted />
                      <Text size={1} muted>Searching…</Text>
                    </Flex>
                  )}

                  {!searching && results.length > 0 && (
                    <Stack space={1}>
                      <Box style={{ borderTop: '1px solid var(--card-border-color)' }} />
                      {results.map(r => {
                        const name = r.legalName_th || r.customerName || '(No name)'
                        const ref  = r.contractNumber ?? r.quotationNumber ?? r._id
                        const site = r.projectEn ?? ''
                        return (
                          <Box key={r._id}>
                            <Card
                              padding={3}
                              radius={2}
                              tone="default"
                              style={{ cursor: 'pointer' }}
                              onClick={() => setSelected(r)}
                            >
                              <Flex justify="space-between" align="center" gap={3}>
                                <Stack space={1}>
                                  <Text size={1} weight="semibold">{name}</Text>
                                  <Text size={0} muted>{ref}{site ? ` — ${site}` : ''}</Text>
                                </Stack>
                                <Text size={0} muted>Select →</Text>
                              </Flex>
                            </Card>
                          </Box>
                        )
                      })}
                    </Stack>
                  )}

                  {!searching && query.trim() && results.length === 0 && (
                    <Text size={1} muted>No contracts found matching "{query}"</Text>
                  )}

                  {error && (
                    <Card padding={3} border radius={2} tone="critical">
                      <Text size={1}>{error}</Text>
                    </Card>
                  )}

                  <Flex justify="flex-end">
                    <Button text="Cancel" mode="ghost" onClick={handleClose} />
                  </Flex>
                </>
              )}

            </Stack>
          ),
        }
      : undefined,
  }
}
