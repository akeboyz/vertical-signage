import { defineField, defineType } from 'sanity'

const TYPE_ICON: Record<string, string> = {
  asset:     '🏦',
  liability: '📋',
  equity:    '📊',
  revenue:   '💰',
  expense:   '💸',
}

const TYPE_LABEL: Record<string, string> = {
  asset:     'Assets',
  liability: 'Liabilities',
  equity:    'Equity',
  revenue:   'Revenue',
  expense:   'Expenses',
}

export default defineType({
  name:  'accountCodeGroup',
  title: 'Account Code Group',
  type:  'document',

  fields: [
    defineField({
      name:     'groupType',
      title:    'Account Type',
      type:     'string',
      readOnly: true,
      options: {
        list: [
          { title: '🏦 Asset',     value: 'asset'     },
          { title: '📋 Liability', value: 'liability' },
          { title: '📊 Equity',    value: 'equity'    },
          { title: '💰 Revenue',   value: 'revenue'   },
          { title: '💸 Expense',   value: 'expense'   },
        ],
      },
    }),
  ],

  preview: {
    select: { groupType: 'groupType' },
    prepare({ groupType }) {
      return {
        title: `${TYPE_ICON[groupType] ?? ''}  ${TYPE_LABEL[groupType] ?? groupType ?? 'Untitled'}`,
      }
    },
  },
})
