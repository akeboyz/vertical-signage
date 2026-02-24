import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'project',
  title: 'Project',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'code',
      title: 'Project Code',
      type: 'slug',
      description: 'Used as ?project=CODE in the kiosk URL. Must be unique across all projects.',
      options: {
        source: 'title',
        slugify: (input: string) =>
          input.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      },
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'handoffBaseUrl',
      title: 'Handoff Base URL',
      type: 'url',
      description: 'Base URL for handoff / QR links. Falls back to https://aquamax.co if blank.',
    }),
    defineField({
      name: 'isActive',
      title: 'Active',
      type: 'boolean',
      initialValue: true,
      description: 'Inactive projects are ignored by the kiosk.',
    }),
  ],
  preview: {
    select: { title: 'title', code: 'code.current', isActive: 'isActive' },
    prepare({ title, code, isActive }) {
      return {
        title: title ?? '(untitled)',
        subtitle: `code: ${code ?? '—'}${isActive === false ? '  ·  INACTIVE' : ''}`,
      }
    },
  },
})
