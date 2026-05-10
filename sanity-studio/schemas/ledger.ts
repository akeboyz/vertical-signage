import { defineField, defineType, defineArrayMember } from 'sanity'
import { LedgerStatementView }                         from '../components/LedgerStatementView'
import { AccountCodeWithNormalBalanceInput }            from '../components/AccountCodeWithNormalBalanceInput'
import { ParentBFSummaryInput }                        from '../components/ParentBFSummaryInput'
import { LockedNumberInput }                           from '../components/LockedNumberInput'
import { LockedDateInput }                             from '../components/LockedDateInput'
import { SupportingDocsInput }                         from '../components/SupportingDocsInput'

/**
 * Ledger — one document per GL account code.
 *
 * Setup tab: link the accountCode and enter the brought-forward opening balance.
 * Ledger Statement tab: period-filtered running balance pulled from all posted
 * accounting entries across Payment, Receipt, Funding, and Procurement.
 */
export default defineType({
  name:  'ledger',
  title: 'General Ledger',
  type:  'document',

  groups: [
    { name: 'statement', title: '📒 Ledger Statement',    default: true },
    { name: 'setup',     title: '⚙️ Setup'                              },
    { name: 'documents', title: '📎 Documents'                          },
  ],

  fields: [

    // ── Setup ─────────────────────────────────────────────────────────────────

    defineField({
      group:       'setup',
      name:        'accountCode',
      title:       '1.1 · Account Code',
      type:        'reference',
      to:          [{ type: 'accountCode' }],
      validation:  Rule => Rule.required(),
      options:     {
        disableNew: true,
        filter: 'isParent != true',
      },
      description: 'Leaf accounts only — parent accounts that have sub-accounts cannot record transactions.',
      components:  { input: AccountCodeWithNormalBalanceInput },
    }),

    defineField({
      name:     'normalBalanceCache',
      title:    'Normal Balance (cached)',
      type:     'string',
      hidden:   true,
      readOnly: true,
    }),

    defineField({
      name:     'isParentCache',
      title:    'Is Parent Account (cached)',
      type:     'boolean',
      hidden:   true,
      readOnly: true,
    }),

    defineField({
      name:     'accountDepthCache',
      title:    'Account Depth (cached)',
      type:     'number',
      hidden:   true,
      readOnly: true,
    }),

    defineField({
      name:     'codeCache',
      title:    'Account Code (cached)',
      type:     'string',
      hidden:   true,
      readOnly: true,
    }),

    // Parent account: show computed B/F summary; hide manual B/F entry fields
    defineField({
      group:      'setup',
      name:       'parentBFView',
      title:      '1.2 · Opening Balance',
      type:       'string',
      readOnly:   true,
      hidden:     ({ document }) => (document?.isParentCache as boolean) !== true,
      components: { input: ParentBFSummaryInput },
    }),

    defineField({
      group:       'setup',
      name:        'broughtForwardDate',
      title:       '1.2 · Brought Forward Date',
      type:        'date',
      hidden:      ({ document }) => (document?.isParentCache as boolean) === true,
      description: 'As of date for the opening balance (e.g. 01 Jan 2026 — your system go-live date).',
      components:  { input: LockedDateInput },
    }),

    defineField({
      group:        'setup',
      name:         'broughtForwardDebit',
      title:        '1.3 · Opening Balance — Debit (THB)',
      type:         'number',
      initialValue: 0,
      hidden:       ({ document }) => (document?.isParentCache as boolean) === true || (document?.normalBalanceCache as string) === 'credit',
      description:  'Pre-system debit balance for this account as of the brought-forward date.',
      components:   { input: LockedNumberInput },
    }),

    defineField({
      group:        'setup',
      name:         'broughtForwardCredit',
      title:        '1.3 · Opening Balance — Credit (THB)',
      type:         'number',
      initialValue: 0,
      hidden:       ({ document }) => (document?.isParentCache as boolean) === true || (document?.normalBalanceCache as string) !== 'credit',
      description:  'Pre-system credit balance for this account as of the brought-forward date.',
      components:   { input: LockedNumberInput },
    }),

    // ── Supporting Documents ──────────────────────────────────────────────────

    defineField({
      group:       'documents',
      name:        'supportingDocs',
      title:       'Supporting Documents',
      type:        'array',
      description: 'Attach bank statements, reconciliation sheets, or any document that supports the opening balance.',
      components:  { input: SupportingDocsInput },
      of: [defineArrayMember({
        type:  'object',
        name:  'ledgerDoc',
        title: 'Document',
        fields: [
          defineField({
            name:       'docType',
            title:      'Document Type',
            type:       'string',
            validation: Rule => Rule.required(),
            options: {
              list: [
                { title: '🏦 Bank Statement',         value: 'bank_statement'    },
                { title: '📊 Audited Accounts',       value: 'audited_accounts'  },
                { title: '📋 Trial Balance Export',   value: 'trial_balance'     },
                { title: '🔁 Reconciliation Sheet',   value: 'reconciliation'    },
                { title: '📉 Depreciation Schedule',  value: 'depreciation'      },
                { title: '📎 Other',                  value: 'other'             },
              ],
            },
          }),
          defineField({
            name:       'asOfDate',
            title:      'Period / As-of Date',
            type:       'date',
            description: 'Date the document covers or is valid as of.',
          }),
          defineField({
            name:       'file',
            title:      'File',
            type:       'file',
            options:    { accept: '.pdf,.xlsx,.xls,.csv,image/*' },
            validation: Rule => Rule.required(),
          }),
          defineField({
            name:  'note',
            title: 'Note',
            type:  'string',
          }),
        ],
        preview: {
          select: { docType: 'docType', asOfDate: 'asOfDate', note: 'note' },
          prepare({ docType, asOfDate, note }: { docType?: string; asOfDate?: string; note?: string }) {
            const icons: Record<string, string> = {
              bank_statement: '🏦', audited_accounts: '📊', trial_balance: '📋',
              reconciliation: '🔁', depreciation: '📉', other: '📎',
            }
            return {
              title:    `${icons[docType ?? ''] ?? '📎'}  ${docType?.replace(/_/g, ' ') ?? 'Document'}`,
              subtitle: [asOfDate, note].filter(Boolean).join('  ·  '),
            }
          },
        },
      })],
    }),

    // ── Ledger Statement (display only) ───────────────────────────────────────

    defineField({
      group:      'statement',
      name:       'ledgerStatement',
      title:      'Ledger Statement',
      type:       'string',
      readOnly:   true,
      components: { input: LedgerStatementView },
    }),

  ],

  preview: {
    select: {
      code:     'accountCode.code',
      nameTh:   'accountCode.nameTh',
      nameEn:   'accountCode.nameEn',
      type:     'accountCode.type',
      isParent: 'isParentCache',
      depth:    'accountDepthCache',
    },
    prepare({ code, nameTh, nameEn, type, isParent, depth }: {
      code?: string; nameTh?: string; nameEn?: string; type?: string; isParent?: boolean; depth?: number
    }) {
      const typeIcon: Record<string, string> = {
        asset: '🏦', liability: '📋', revenue: '💰', expense: '💸', equity: '📊',
      }
      const depthLabel =
        depth === 0 ? '📁 Group Account'
        : depth === 1 ? '📂 Sub-group'
        : depth === 2 ? '📂 Sub-sub-group'
        : null

      return {
        title:    `${code ?? ''}  ·  ${nameTh ?? nameEn ?? '(No name)'}`,
        subtitle: isParent && depthLabel
          ? `${depthLabel}  ·  ${typeIcon[type ?? ''] ?? ''} ${type ?? ''}`
          : `${typeIcon[type ?? ''] ?? ''} ${type ?? ''}`,
      }
    },
  },
})
