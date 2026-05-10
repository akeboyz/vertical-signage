/**
 * accountingEntryField
 *
 * Shared field definition added to Payment, Receipt, Funding, and Procurement.
 * The `lines[]` array carries the double-entry Dr/Cr lines.
 * `entrySummary` is a display-only component that shows totals + Post button.
 */

import { defineField, defineArrayMember } from 'sanity'
import { AccountingEntryInput }           from '../components/AccountingEntryInput'
import { AccountingDateInput }            from '../components/AccountingDateInput'
import { makeGlAccountInput }             from '../components/GlAccountInput'

// All leaf accounts across every type, sorted by sortKey — used in Edit Line dialog
const AllLeafAccountInput = makeGlAccountInput(
  ['asset', 'liability', 'equity', 'revenue', 'expense'],
  { allowCreditBalance: true },
)

export const accountingEntryField = defineField({
  group:   'accounting',
  name:    'accountingEntry',
  title:   'Accounting Entry',
  type:    'object',
  options: { collapsible: false },

  fields: [

    defineField({
      name:         'glStatus',
      title:        'Posting Status',
      type:         'string',
      initialValue: 'draft',
      hidden:       true,
    }),

    defineField({
      name:        'entryDate',
      title:       'Accounting Date',
      type:        'date',
      description:  'Auto-filled from the transaction date.',
      readOnly:     true,
      components:   { input: AccountingDateInput },
    }),

    defineField({
      name:     'postedAt',
      title:    'Posted At',
      type:     'datetime',
      hidden:   true,
      readOnly: true,
    }),

    defineField({
      name:  'lines',
      title: 'Journal Lines',
      type:  'array',
      of: [defineArrayMember({
        type:  'object',
        name:  'accountingLine',
        title: 'Line',
        fields: [
          defineField({
            name:       'accountCode',
            title:      'Account',
            type:       'reference',
            to:         [{ type: 'accountCode' }],
            options:    { disableNew: true },
            validation: Rule => Rule.required(),
            components: { input: AllLeafAccountInput },
          }),
          defineField({ name: 'description',  title: 'Description', type: 'string' }),
          defineField({ name: 'debitAmount',  title: 'Debit (Dr)',  type: 'number', initialValue: 0, validation: Rule => Rule.min(0) }),
          defineField({ name: 'creditAmount', title: 'Credit (Cr)', type: 'number', initialValue: 0, validation: Rule => Rule.min(0) }),
        ],
        preview: {
          select: { code: 'accountCode.code', nameTh: 'accountCode.nameTh', desc: 'description', dr: 'debitAmount', cr: 'creditAmount' },
          prepare({ code, nameTh, desc, dr, cr }: { code?: string; nameTh?: string; desc?: string; dr?: number; cr?: number }) {
            const f    = (n: number) => Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })
            const side = (dr ?? 0) > 0 ? `Dr  ${f(dr!)}` : `Cr  ${f(cr!)}`
            return {
              title:    `${code ?? ''} ${nameTh ?? desc ?? ''}`.trim() || '(No account)',
              subtitle: side,
            }
          },
        },
      })],
      readOnly: ({ document }: any) => document?.accountingEntry?.glStatus === 'posted',
    }),

    defineField({
      name:       'entrySummary',
      title:      'Summary & Actions',
      type:       'string',
      readOnly:   true,
      components: { input: AccountingEntryInput },
    }),

  ],
})
