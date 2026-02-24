import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'playlistItem',
  title: 'Playlist Item',
  type: 'document',
  fields: [
    // ── Project scope ────────────────────────────────────────────────────────
    defineField({
      name: 'project',
      title: 'Project',
      type: 'reference',
      to: [{ type: 'project' }],
      validation: Rule => Rule.required(),
      options: { filter: 'isActive == true' },
    }),

    // ── Scheduling ───────────────────────────────────────────────────────────
    defineField({
      name: 'order',
      title: 'Play Order',
      type: 'number',
      validation: Rule => Rule.required().min(1),
    }),
    defineField({
      name: 'enabled',
      title: 'Enabled',
      type: 'boolean',
      initialValue: true,
      description: 'Uncheck to temporarily hide this item from the playlist.',
    }),
    defineField({
      name: 'startAt',
      title: 'Start At',
      type: 'datetime',
      description: 'Optional — show this item only from this date/time onward.',
    }),
    defineField({
      name: 'endAt',
      title: 'End At',
      type: 'datetime',
      description: 'Optional — stop showing this item after this date/time.',
      validation: Rule =>
        Rule.custom((value, context) => {
          const { startAt } = context.parent as { startAt?: string }
          if (value && startAt && value <= startAt) return 'End At must be after Start At'
          return true
        }),
    }),

    // ── Media source (kiosk uses coalesce(videoFile.asset->url, url)) ────────
    defineField({
      name: 'url',
      title: 'Video URL (external MP4 or HLS .m3u8)',
      type: 'url',
      description: 'Paste an external URL, OR leave blank and upload a file below.',
    }),
    defineField({
      name: 'videoFile',
      title: 'Video File (upload MP4)',
      type: 'file',
      description: 'Uploaded file takes priority over URL if both are set.',
      options: { accept: 'video/*' },
    }),

    // ── CTA / routing ────────────────────────────────────────────────────────
    defineField({ name: 'cta_en', title: 'CTA Text (English)', type: 'string' }),
    defineField({ name: 'cta_th', title: 'CTA Text (Thai)',    type: 'string' }),
    defineField({
      name: 'category',
      title: 'Category (routing on tap)',
      type: 'string',
      description: 'Which category screen opens when the user taps Touch to Explore.',
      options: {
        list: [
          { title: 'Food',             value: 'food' },
          { title: 'Groceries',        value: 'groceries' },
          { title: 'Services',         value: 'services' },
          { title: 'For Rent',         value: 'rent' },
          { title: 'For Sale',         value: 'sale' },
          { title: 'Building Updates', value: 'building-updates' },
        ],
      },
    }),
  ],

  orderings: [{
    title: 'Play Order',
    name: 'orderAsc',
    by: [{ field: 'order', direction: 'asc' }],
  }],

  preview: {
    select: {
      cta:         'cta_en',
      projectCode: 'project.code.current',
      order:       'order',
      url:         'url',
      filename:    'videoFile.asset.originalFilename',
      enabled:     'enabled',
    },
    prepare({ cta, projectCode, order, url, filename, enabled }) {
      const source = filename ?? url ?? '(no source)'
      const status = enabled === false ? '  ·  DISABLED' : ''
      return {
        title:    `${order ?? '?'}. ${cta ?? '(no CTA)'}${status}`,
        subtitle: `[${projectCode ?? '?'}]  ${source}`,
      }
    },
  },
})
