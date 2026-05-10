import { defineField, defineType } from 'sanity'

const MONTHS = [
  { title: 'January',   value: 1  },
  { title: 'February',  value: 2  },
  { title: 'March',     value: 3  },
  { title: 'April',     value: 4  },
  { title: 'May',       value: 5  },
  { title: 'June',      value: 6  },
  { title: 'July',      value: 7  },
  { title: 'August',    value: 8  },
  { title: 'September', value: 9  },
  { title: 'October',   value: 10 },
  { title: 'November',  value: 11 },
  { title: 'December',  value: 12 },
]

export default defineType({
  name:  'fiscalYearConfig',
  title: 'Fiscal Year Config',
  type:  'document',

  fields: [
    defineField({
      name:        'fiscalYearEndMonth',
      title:       'Fiscal Year End Month',
      type:        'number',
      options:     { list: MONTHS },
      initialValue: 12,
      validation:  Rule => Rule.required().min(1).max(12),
      description: 'The month in which the fiscal year ends. The last day of this month is used as the year-end date.',
    }),
  ],

  preview: {
    select:   { month: 'fiscalYearEndMonth' },
    prepare: ({ month }: { month?: number }) => ({
      title:    'Fiscal Year Config',
      subtitle: month ? `Year ends: ${MONTHS.find(m => m.value === month)?.title ?? month}` : 'Not configured',
    }),
  },
})
