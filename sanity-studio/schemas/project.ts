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
      name: 'isActive',
      title: 'Active',
      type: 'boolean',
      initialValue: true,
      description: 'Inactive projects are ignored by the kiosk build.',
    }),

    // ── Location ──────────────────────────────────────────────────────────────
    defineField({
      name: 'address',
      title: 'Address',
      type: 'text',
      rows: 2,
    }),
    defineField({
      name: 'addressBaseNumber',
      title: 'Address Base Number',
      type: 'number',
      description: 'e.g. 120 → combined with provider.unitRef to form unit address "120/406".',
    }),
    defineField({
      name: 'mapUrl',
      title: 'Map URL',
      type: 'url',
      description: 'Google Maps link for this project location.',
    }),

    // ── URLs ──────────────────────────────────────────────────────────────────
    defineField({
      name: 'kioskBaseUrl',
      title: 'Kiosk Base URL',
      type: 'url',
      description: 'Root URL of the kiosk app (e.g. https://lumpini-kiosk.netlify.app).',
    }),
    defineField({
      name: 'kioskUrl',
      title: 'Kiosk URL (full)',
      type: 'url',
      description: 'Full kiosk URL including ?project=code. Copy this for device setup.',
    }),
    defineField({
      name: 'handoffBaseURL',
      title: 'Handoff Base URL',
      type: 'url',
      description: 'Base URL for handoff / QR links on mobile landing pages.',
    }),
  ],

  preview: {
    select: { title: 'title', code: 'code.current', isActive: 'isActive' },
    prepare({ title, code, isActive }) {
      return {
        title:    title ?? '(untitled)',
        subtitle: `code: ${code ?? '—'}${isActive === false ? '  ·  INACTIVE' : ''}`,
      }
    },
  },
})
