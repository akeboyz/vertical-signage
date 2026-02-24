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

    // ── Play order ────────────────────────────────────────────────────────────
    defineField({
      name: 'order',
      title: 'Play Order',
      type: 'number',
      validation: Rule => Rule.required().min(1),
    }),

    // ── Slot switch ───────────────────────────────────────────────────────────
    // enabled here controls the playlist *slot* independently of media.enabled.
    // Both must be true for the kiosk to show the item.
    defineField({
      name: 'enabled',
      title: 'Enabled',
      type: 'boolean',
      initialValue: true,
      description: 'Uncheck to hide this slot without deleting it.',
    }),

    // ── Media reference ───────────────────────────────────────────────────────
    // CTA text, category, asset URL, schedule, and provider are all on the
    // referenced media document — not repeated here (single source of truth).
    // cta_en / cta_th removed: CTA is standardised per category in the kiosk.
    // startAt / endAt removed: canonical schedule lives on media.startAt/endAt.
    // Kiosk GROQ: resolve via media->{ ..., "url": coalesce(videoFile.asset->url, imageFile.asset->url, url) }
    defineField({
      name: 'media',
      title: 'Media',
      type: 'reference',
      to: [{ type: 'media' }],
      validation: Rule => Rule.required(),
      description: 'Only enabled media assigned to this playlist\'s project will appear in the picker.',
      options: {
        // Filter media to items that include this playlist item's project
        // and are marked enabled. Falls back to all media if project not yet set.
        filter: ({ document }: { document: Record<string, any> }) => {
          const projectRef = document?.project?._ref
          if (!projectRef) return { filter: 'enabled == true' }
          return {
            filter: '$projectId in projects[]._ref && enabled == true',
            params: { projectId: projectRef },
          }
        },
      },
    }),

    // ── Image duration override ───────────────────────────────────────────────
    // Kiosk resolution: imageDurationOverride ?? media->defaultImageDuration ?? 10
    // Leave blank to use the media document's default. Ignored for video slots.
    defineField({
      name: 'imageDurationOverride',
      title: 'Image Duration Override (seconds)',
      type: 'number',
      description: 'Overrides the media default for this slot only. Leave blank to inherit.',
      validation: Rule => Rule.min(1).max(300),
    }),
  ],

  orderings: [{
    title: 'Play Order',
    name: 'orderAsc',
    by: [{ field: 'order', direction: 'asc' }],
  }],

  preview: {
    select: {
      mediaTitle:    'media.title',
      mediaType:     'media.type',
      mediaCategory: 'media.category',
      projectCode:   'project.code.current',
      order:         'order',
      enabled:       'enabled',
    },
    prepare({ mediaTitle, mediaType, mediaCategory, projectCode, order, enabled }) {
      const status = enabled === false ? '  ·  DISABLED' : ''
      return {
        title:    `${order ?? '?'}. ${mediaTitle ?? '(no media)'}${status}`,
        subtitle: `[${projectCode ?? '?'}]  ${mediaType ?? '?'}  ·  ${mediaCategory ?? '—'}`,
      }
    },
  },
})
