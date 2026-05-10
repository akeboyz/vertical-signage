import { defineField, defineType, defineArrayMember } from 'sanity'

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

    defineField({
      name:        'supportingDocs',
      title:       'Supporting Documents',
      type:        'array',
      description: 'Attach any files related to financial statements — audited reports, working papers, management letters, memos, screenshots, etc.',
      of: [defineArrayMember({
        type:  'object',
        name:  'fsDoc',
        title: 'Document',
        fields: [
          defineField({
            name:       'label',
            title:      'Label',
            type:       'string',
            validation: Rule => Rule.required(),
            description: 'Describe the file — e.g. "Audited FS FY 2025", "Bank confirmation letter", "Tax filing receipt"',
          }),
          defineField({
            name:  'fiscalYearLabel',
            title: 'Fiscal Year',
            type:  'string',
            description: 'Optional — e.g. "FY 2025". Leave blank for year-agnostic documents.',
          }),
          defineField({
            name:       'file',
            title:      'File',
            type:       'file',
            options:    { accept: '.pdf,.xlsx,.xls,.csv,.doc,.docx,image/*' },
            validation: Rule => Rule.required(),
          }),
          defineField({
            name:         'uploadedAt',
            title:        'Uploaded At',
            type:         'datetime',
            readOnly:     true,
            initialValue: () => new Date().toISOString(),
          }),
          defineField({
            name:  'notes',
            title: 'Notes',
            type:  'text',
            rows:  2,
            description: 'Optional internal notes about this file.',
          }),
        ],
        preview: {
          select: { label: 'label', fy: 'fiscalYearLabel', uploadedAt: 'uploadedAt' },
          prepare({ label, fy, uploadedAt }: { label?: string; fy?: string; uploadedAt?: string }) {
            return {
              title:    label ?? 'Untitled',
              subtitle: [fy, uploadedAt ? uploadedAt.slice(0, 10) : null].filter(Boolean).join('  ·  '),
            }
          },
        },
      })],
    }),
  ],
  preview: {
    select:   {},
    prepare:  () => ({ title: 'Financial Statements' }),
  },
})
