import { defineField, defineType } from 'sanity'

/**
 * Account Code — Chart of Accounts master list.
 * Referenced by expense categories (Process Setup), payments, cost items,
 * service contracts, and rent space to enable accounting-grouped reporting.
 */
export default defineType({
  name:  'accountCode',
  title: 'Account Code',
  type:  'document',

  groups: [
    { name: 'identity', title: 'Identity', default: true },
    { name: 'meta',     title: 'Details'                 },
  ],

  fields: [

    // ── Identity ──────────────────────────────────────────────────────────────

    defineField({
      group:      'identity',
      name:       'no',
      title:      'No.',
      type:       'number',
      description: 'Sequential display number for ordering in lists.',
    }),

    defineField({
      group:      'identity',
      name:       'code',
      title:      'Account Code',
      type:       'string',
      validation: Rule => Rule.required(),
      description: 'e.g. 1100, 2100, 4100, 5200',
    }),

    defineField({
      group:      'identity',
      name:       'nameTh',
      title:      'Account Name (Thai)',
      type:       'string',
      validation: Rule => Rule.required(),
      description: 'ชื่อบัญชี ภาษาไทย',
    }),

    defineField({
      group:      'identity',
      name:       'nameEn',
      title:      'Account Name (English)',
      type:       'string',
      description: 'e.g. Cash & Bank, Accounts Payable, Rental Revenue',
    }),

    defineField({
      group:   'identity',
      name:    'type',
      title:   'Account Type',
      type:    'string',
      options: {
        list: [
          { title: '🏦 Asset',     value: 'asset'     },
          { title: '📋 Liability', value: 'liability' },
          { title: '💰 Revenue',   value: 'revenue'   },
          { title: '💸 Expense',   value: 'expense'   },
          { title: '📊 Equity',    value: 'equity'    },
        ],
        layout: 'radio',
      },
      validation: Rule => Rule.required(),
    }),

    defineField({
      group:   'identity',
      name:    'normalBalance',
      title:   'Normal Balance',
      type:    'string',
      options: {
        list: [
          { title: 'Debit',  value: 'debit'  },
          { title: 'Credit', value: 'credit' },
        ],
        layout: 'radio',
      },
      description: 'Assets & Expenses = Debit. Liabilities, Revenue & Equity = Credit.',
    }),

    // ── Details ───────────────────────────────────────────────────────────────

    defineField({
      group:       'meta',
      name:        'parentCode',
      title:       'Parent Account',
      type:        'reference',
      to:          [{ type: 'accountCode' }],
      description: 'Optional — for sub-accounts (e.g. 5210 is a child of 5200).',
    }),

    defineField({
      group:       'meta',
      name:        'description',
      title:       'Description',
      type:        'text',
      rows:        2,
      description: 'What transactions belong in this account.',
    }),

    defineField({
      group:        'meta',
      name:         'isParent',
      title:        'Parent Account (header only)',
      type:         'boolean',
      initialValue: false,
      description:  'Tick this if the account has sub-accounts. Parent accounts cannot record transactions directly — use the sub-accounts instead.',
    }),

    defineField({
      group:        'meta',
      name:         'isActive',
      title:        'Active',
      type:         'boolean',
      initialValue: true,
      description:  'Inactive codes are hidden from dropdowns but preserved for historical records.',
    }),

    defineField({
      group:   'meta',
      name:    'linkedSchedule',
      title:   'Linked Schedule',
      type:    'string',
      options: {
        list: [
          { title: '🏗 Asset Register', value: 'asset_register' },
          { title: '📬 AR Aging',       value: 'ar_aging'       },
          { title: '📪 AP Aging',       value: 'ap_aging'       },
        ],
        layout: 'radio',
      },
      description: 'Optional — links this account to a sub-ledger schedule. Enables the 🔍 shortcut on the GL list and statement views.',
    }),

    // Hidden sort field: prefix digit + stored code zero-padded to 8 digits.
    // e.g. asset "5101"  → "100005101", asset "15202" → "100015202"
    //      expense "5200" → "500005200"
    // Fixed-width string → correct lexicographic = numeric order regardless of code length.
    defineField({
      name:     'sortKey',
      title:    'Sort Key',
      type:     'string',
      hidden:   true,
      readOnly: true,
    }),

  ],

  orderings: [
    {
      name:  'sortKeyAsc',
      title: 'Account Code (ascending)',
      by:    [{ field: 'sortKey', direction: 'asc' }],
    },
  ],

  preview: {
    select: {
      code:     'code',
      nameTh:   'nameTh',
      nameEn:   'nameEn',
      type:     'type',
      isActive: 'isActive',
    },
    prepare({ code, nameTh, nameEn, type, isActive }) {
      const typeIcon: Record<string, string> = {
        asset: '🏦', liability: '📋', revenue: '💰', expense: '💸', equity: '📊',
      }
      const groupPrefix: Record<string, string> = {
        asset: '1', liability: '2', equity: '3', revenue: '4', expense: '5',
      }
      const prefix      = groupPrefix[type ?? ''] ?? ''
      const displayName = nameTh ?? nameEn ?? ''
      return {
        title:    `${prefix}${code}  ·  ${displayName}`,
        subtitle: `${typeIcon[type ?? ''] ?? ''} ${type ?? ''}${!isActive ? '  ·  Inactive' : ''}`,
      }
    },
  },
})
