import { useState, useEffect }    from 'react'
import { useClient, useFormValue } from 'sanity'
import { Card, Flex, Stack, Text, Spinner } from '@sanity/ui'

const fmt = (n: number) =>
  Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface LedgerBF {
  broughtForwardDebit?:  number
  broughtForwardCredit?: number
}

interface DescendantNode {
  _id:           string
  normalBalance: string
  ledger?:       LedgerBF
  children?:     DescendantNode[]
}

interface ChildRow {
  _id:           string
  code:          string
  nameTh:        string
  nameEn:        string
  normalBalance: string
  isParent?:     boolean
  ledger?:       LedgerBF
  grandChildren: DescendantNode[]
}

// Recursively collect all leaf-level BF totals from a subtree
function sumLeafBF(node: DescendantNode): { dr: number; cr: number } {
  if (!node.children || node.children.length === 0) {
    return {
      dr: node.ledger?.broughtForwardDebit  ?? 0,
      cr: node.ledger?.broughtForwardCredit ?? 0,
    }
  }
  return node.children.reduce(
    (acc, c) => { const s = sumLeafBF(c); return { dr: acc.dr + s.dr, cr: acc.cr + s.cr } },
    { dr: 0, cr: 0 }
  )
}

export function ParentBFSummaryInput(_props: any) {
  const client     = useClient({ apiVersion: '2024-01-01' })
  const accountRef = useFormValue(['accountCode'])        as { _ref?: string } | undefined
  const normalBal  = useFormValue(['normalBalanceCache']) as string | undefined
  const accountId  = accountRef?._ref

  const [rows,    setRows]    = useState<ChildRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!accountId) { setRows([]); return }
    let cancelled = false
    setLoading(true)
    client
      .fetch<ChildRow[]>(
        `*[_type == "accountCode" && parentCode._ref == $id] | order(code asc) {
          _id, code, nameTh, nameEn, normalBalance, isParent,
          "ledger": *[_type == "ledger" && !(_id in path("drafts.**")) && accountCode._ref == ^._id][0]{
            broughtForwardDebit, broughtForwardCredit
          },
          "grandChildren": *[_type == "accountCode" && parentCode._ref == ^._id] {
            _id, normalBalance,
            "ledger": *[_type == "ledger" && !(_id in path("drafts.**")) && accountCode._ref == ^._id][0]{
              broughtForwardDebit, broughtForwardCredit
            },
            "children": *[_type == "accountCode" && parentCode._ref == ^._id] {
              _id, normalBalance,
              "ledger": *[_type == "ledger" && !(_id in path("drafts.**")) && accountCode._ref == ^._id][0]{
                broughtForwardDebit, broughtForwardCredit
              }
            }
          }
        }`,
        { id: accountId }
      )
      .then(children => { if (!cancelled) setRows(children) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [accountId, client]) // eslint-disable-line react-hooks/exhaustive-deps

  // If a direct child is itself a parent (has grandchildren), roll up from those;
  // otherwise use the child's own ledger values.
  const getChildBF = (child: ChildRow): { dr: number; cr: number } => {
    if (child.grandChildren && child.grandChildren.length > 0) {
      return child.grandChildren.reduce(
        (acc, gc) => { const s = sumLeafBF(gc); return { dr: acc.dr + s.dr, cr: acc.cr + s.cr } },
        { dr: 0, cr: 0 }
      )
    }
    return {
      dr: child.ledger?.broughtForwardDebit  ?? 0,
      cr: child.ledger?.broughtForwardCredit ?? 0,
    }
  }

  const isDebitNormal = normalBal !== 'credit'

  const processedRows = rows.map(r => {
    const { dr: bfDebit, cr: bfCredit } = getChildBF(r)
    const isChildDebit = r.normalBalance !== 'credit'
    const bal  = isChildDebit ? bfDebit - bfCredit : bfCredit - bfDebit
    const side = bal >= 0
      ? (isChildDebit ? 'Dr' : 'Cr')
      : (isChildDebit ? 'Cr' : 'Dr')
    return { ...r, bfDebit, bfCredit, bal, side }
  })

  const totalDr  = processedRows.reduce((s, r) => s + r.bfDebit,  0)
  const totalCr  = processedRows.reduce((s, r) => s + r.bfCredit, 0)
  const totalBal = isDebitNormal ? totalDr - totalCr : totalCr - totalDr
  const totalSide = totalBal >= 0
    ? (isDebitNormal ? 'Dr' : 'Cr')
    : (isDebitNormal ? 'Cr' : 'Dr')

  const cell = (align: 'left' | 'right' = 'left'): React.CSSProperties => ({
    padding: '5px 10px', textAlign: align, fontSize: 12,
    borderBottom: '1px solid var(--card-border-color)',
  })
  const head = (align: 'left' | 'right' = 'left'): React.CSSProperties => ({
    ...cell(align), fontWeight: 600, background: 'var(--card-muted-bg-color)',
  })

  return (
    <Card padding={3} radius={2} tone="primary" border>
      <Stack space={3}>

        <Flex justify="space-between" align="center">
          <Text size={1} weight="semibold">Opening Balance — computed from sub-accounts</Text>
          {loading && <Spinner muted />}
        </Flex>

        {!loading && rows.length === 0 && (
          <Text size={1} muted>No sub-accounts found.</Text>
        )}

        {!loading && rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={head()}>Sub-account</th>
                  <th style={head('right')}>Debit</th>
                  <th style={head('right')}>Credit</th>
                  <th style={head('right')}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {processedRows.map(r => (
                  <tr key={r._id}>
                    <td style={cell()}>
                      <span style={{ fontWeight: 600, fontFamily: 'monospace', marginRight: 6 }}>{r.code}</span>
                      <span style={{ color: 'var(--card-muted-fg-color)' }}>{r.nameTh || r.nameEn}</span>
                      {r.isParent && (
                        <span style={{ fontSize: 10, color: 'var(--card-muted-fg-color)', marginLeft: 6 }}>(group)</span>
                      )}
                    </td>
                    <td style={cell('right')}>{r.bfDebit  > 0 ? fmt(r.bfDebit)  : '—'}</td>
                    <td style={cell('right')}>{r.bfCredit > 0 ? fmt(r.bfCredit) : '—'}</td>
                    <td style={cell('right')}>
                      {fmt(Math.abs(r.bal))}
                      {' '}<span style={{ fontSize: 10, color: 'var(--card-muted-fg-color)' }}>{r.side}</span>
                    </td>
                  </tr>
                ))}

                <tr style={{ background: 'var(--card-muted-bg-color)' }}>
                  <td style={{ ...cell(), fontWeight: 700 }}>Total</td>
                  <td style={{ ...cell('right'), fontWeight: 700 }}>{fmt(totalDr)}</td>
                  <td style={{ ...cell('right'), fontWeight: 700 }}>{fmt(totalCr)}</td>
                  <td style={{ ...cell('right'), fontWeight: 700 }}>
                    {fmt(Math.abs(totalBal))}
                    {' '}<span style={{ fontSize: 10, color: 'var(--card-muted-fg-color)' }}>{totalSide}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <Text size={0} muted>Read-only — enter brought-forward balances on each sub-account in Setup.</Text>
      </Stack>
    </Card>
  )
}
