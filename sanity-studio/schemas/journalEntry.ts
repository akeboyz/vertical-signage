import { defineField, defineType, defineArrayMember } from 'sanity'
import { createAutoNumberInput }    from '../components/AutoNumberInput'
import { AutoJournalStatusInput }   from '../components/AutoJournalStatusInput'
import { accountingEntryField }     from './accountingEntryField'

// docType 'journalEntry' → fieldName 'journalEntryNumber', schemaType 'journalEntry'
const JournalNumberInput = createAutoNumberInput('journalEntry', { fixedPrefix: 'JE', dateField: 'date' })

const TYPE_ICON: Record<string, string> = {
  depreciation:    '📉',
  accrual:         '📋',
  prepaid:         '📦',
  correction:      '🔁',
  opening_balance: '🏁',
  tax_provision:   '🧾',
  transfer:        '🔄',
  other:           '📝',
}

export default defineType({
  name:  'journalEntry',
  title: 'Journal Entry',
  type:  'document',

  groups: [
    { name: 'setup',      title: '1. Setup',      default: true },
    { name: 'accounting', title: '2. Accounting'               },
  ],

  orderings: [
    { title: 'Date — Newest', name: 'dateDesc', by: [{ field: 'date',               direction: 'desc' }] },
    { title: 'Date — Oldest', name: 'dateAsc',  by: [{ field: 'date',               direction: 'asc'  }] },
    { title: 'Ref — Newest',  name: 'numDesc',  by: [{ field: 'journalEntryNumber', direction: 'desc' }] },
    { title: 'Type',          name: 'typeAsc',  by: [{ field: 'journalType',        direction: 'asc'  }] },
  ],

  fields: [

    // ── Setup ─────────────────────────────────────────────────────────────────

    defineField({
      group:       'setup',
      name:        'journalEntryNumber',
      title:       '1.1 · Reference Number',
      type:        'string',
      description: 'Auto-generated. Format: JE-yymm-001.',
      components:  { input: JournalNumberInput },
      validation:  Rule => Rule.custom(async (value, context) => {
        if (!value) return true
        const client = (context as any).getClient({ apiVersion: '2024-01-01' })
        const selfId = (context.document?._id as string)?.replace(/^drafts\./, '')
        const count  = await client.fetch(
          `count(*[_type == "journalEntry" && journalEntryNumber == $num && _id != $self && !(_id in path("drafts.**"))])`,
          { num: value, self: selfId ?? '' },
        ) as number
        return count === 0 ? true : `"${value}" is already used — regenerate to get a unique number.`
      }),
    }),

    defineField({
      group:      'setup',
      name:       'journalType',
      title:      '1.2 · Journal Type',
      type:       'string',
      validation: Rule => Rule.required(),
      options: {
        list: [
          { title: '📉 Depreciation — monthly fixed asset depreciation charge',           value: 'depreciation'    },
          { title: '📋 Accrual — period-end accrued income or expense',                   value: 'accrual'         },
          { title: '📦 Prepaid — amortisation of prepaid expense or deferred income',     value: 'prepaid'         },
          { title: '🔁 Correction — reversal or correction of a prior posting error',     value: 'correction'      },
          { title: '🏁 Opening Balance — initial account balance brought into the GL',    value: 'opening_balance' },
          { title: '🧾 Tax Provision — corporate income tax or deferred tax adjustment',  value: 'tax_provision'   },
          { title: '🔄 Transfer — reclassification or inter-account transfer',            value: 'transfer'        },
          { title: '📝 Other — general manual adjustment',                                value: 'other'           },
        ],
        layout: 'radio',
      },
    }),

    defineField({
      group:      'setup',
      name:       'date',
      title:      '1.3 · Entry Date',
      type:       'date',
      validation: Rule => Rule.required(),
      description: 'The accounting date this entry will appear on in the ledger.',
    }),

    defineField({
      group:       'setup',
      name:        'memo',
      title:       '1.4 · Memo / Narrative',
      type:        'text',
      rows:        2,
      validation:  Rule => Rule.required(),
      description: 'Brief explanation of why this adjustment is being made.',
    }),

    defineField({
      group:      'setup',
      name:       'status',
      title:      '1.5 · Status',
      type:       'string',
      readOnly:   true,
      components: { input: AutoJournalStatusInput },
    }),

    // Voiding — only visible after the entry has been posted
    defineField({
      group:       'setup',
      name:        'voidedAt',
      title:       'Voided At',
      type:        'date',
      hidden:      ({ document }) => (document?.accountingEntry as any)?.glStatus !== 'posted',
      description: 'Set this date to void the entry. A voided entry is excluded from all reports — create a correction entry to reverse its effect.',
    }),

    defineField({
      group:      'setup',
      name:       'voidedReason',
      title:      'Void Reason',
      type:       'string',
      hidden:     ({ document }) => !document?.voidedAt,
      validation: Rule => Rule.custom((value, context) => {
        if (!context.document?.voidedAt) return true
        if (!(value as string)?.trim()) return 'A reason is required when voiding an entry.'
        return true
      }),
    }),

    defineField({
      group:       'setup',
      name:        'supportingDocs',
      title:       '1.6 · Supporting Documents',
      type:        'array',
      description: 'Attach calculation sheets, approval emails, or any supporting documentation.',
      of: [defineArrayMember({
        type:  'object',
        name:  'jeDoc',
        fields: [
          defineField({
            name:    'docType',
            title:   'Document Type',
            type:    'string',
            options: {
              list: [
                { title: 'Calculation Sheet', value: 'calc_sheet' },
                { title: 'Approval Email',    value: 'approval'   },
                { title: 'Bank Statement',    value: 'bank_stmt'  },
                { title: 'Invoice / Receipt', value: 'invoice'    },
                { title: 'Other',             value: 'other'      },
              ],
            },
            validation: Rule => Rule.required(),
          }),
          defineField({ name: 'file', title: 'File', type: 'file', options: { accept: '.pdf,image/*' } }),
          defineField({ name: 'note', title: 'Note', type: 'string' }),
        ],
        preview: {
          select: { docType: 'docType', note: 'note' },
          prepare({ docType, note }: { docType?: string; note?: string }) {
            const icons: Record<string, string> = {
              calc_sheet: '📊', approval: '✅', bank_stmt: '🏦', invoice: '🧾', other: '📎',
            }
            return {
              title:    `${icons[docType ?? ''] ?? '📎'} ${docType ?? 'Document'}`,
              subtitle: note ?? '',
            }
          },
        },
      })],
    }),

    // ── Accounting ────────────────────────────────────────────────────────────

    accountingEntryField,

  ],

  preview: {
    select: {
      number:      'journalEntryNumber',
      journalType: 'journalType',
      date:        'date',
      memo:        'memo',
      glStatus:    'accountingEntry.glStatus',
      voidedAt:    'voidedAt',
    },
    prepare({ number, journalType, date, memo, glStatus, voidedAt }: {
      number?: string; journalType?: string; date?: string
      memo?: string;  glStatus?: string;    voidedAt?: string
    }) {
      const statusLabel: Record<string, string> = {
        draft: '📝 Draft', posted: '✅ Posted', voided: '🚫 Voided',
      }
      const status = voidedAt ? 'voided' : (glStatus === 'posted' ? 'posted' : 'draft')
      return {
        title:    `${TYPE_ICON[journalType ?? ''] ?? '📝'}  ${number ?? '(no number)'}  —  ${memo ?? ''}`,
        subtitle: [statusLabel[status], date ?? ''].filter(Boolean).join('  ·  '),
      }
    },
  },
})
