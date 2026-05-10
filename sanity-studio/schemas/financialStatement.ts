import { defineField, defineType } from 'sanity'

export default defineType({
  name:  'financialStatement',
  title: 'Financial Statements',
  type:  'document',
  fields: [
    defineField({
      name:     'placeholder',
      title:    'Financial Statements',
      type:     'string',
      hidden:   true,
      readOnly: true,
    }),
  ],
  preview: {
    select:   {},
    prepare:  () => ({ title: 'Financial Statements' }),
  },
})
