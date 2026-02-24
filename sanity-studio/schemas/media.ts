import { defineField, defineType } from 'sanity'

// Shared category list — kept in sync with kiosk routing values.
// playlistItem.category was removed; category is now canonical here.
const CATEGORY_LIST = [
  { title: 'Food',             value: 'food' },
  { title: 'Groceries',        value: 'groceries' },
  { title: 'Services',         value: 'services' },
  { title: 'For Rent',         value: 'rent' },
  { title: 'For Sale',         value: 'sale' },
  { title: 'Building Updates', value: 'building-updates' },
]

export default defineType({
  name: 'media',
  title: 'Media',
  type: 'document',
  fields: [
    // ── Identity ─────────────────────────────────────────────────────────────
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: Rule => Rule.required(),
    }),

    defineField({
      name: 'type',
      title: 'Type',
      type: 'string',
      options: {
        list: [
          { title: 'Video (MP4)', value: 'video' },
          { title: 'Image (JPG / PNG)', value: 'image' },
        ],
        layout: 'radio',
      },
      validation: Rule => Rule.required(),
    }),

    // ── Asset files ───────────────────────────────────────────────────────────
    // GROQ: mediaUrl = coalesce(videoFile.asset->url, imageFile.asset->url)
    // CDN pattern (video):  https://cdn.sanity.io/files/awjj9g8u/production/<hash>.mp4
    // CDN pattern (image):  https://cdn.sanity.io/images/awjj9g8u/production/<hash>.jpg
    // To copy the URL: open the asset in Studio → click the external-link icon.
    defineField({
      name: 'videoFile',
      title: 'Video File (MP4)',
      type: 'file',
      options: { accept: 'video/*' },
      description: 'Required when Type = Video. After upload, click the asset to copy the CDN URL.',
      hidden: ({ document }) => (document as any)?.type !== 'video',
      validation: Rule =>
        Rule.custom((value, context) => {
          if ((context.document as any)?.type === 'video' && !value)
            return 'Video file is required when Type is Video'
          return true
        }),
    }),

    defineField({
      name: 'imageFile',
      title: 'Image File (JPG / PNG)',
      type: 'image',
      options: { accept: 'image/*', hotspot: true },
      description: 'Required when Type = Image. After upload, click the asset to copy the CDN URL.',
      hidden: ({ document }) => (document as any)?.type !== 'image',
      validation: Rule =>
        Rule.custom((value, context) => {
          if ((context.document as any)?.type === 'image' && !value)
            return 'Image file is required when Type is Image'
          return true
        }),
    }),

    // ── Project assignment ────────────────────────────────────────────────────
    defineField({
      name: 'projects',
      title: 'Projects',
      type: 'array',
      of: [{
        type: 'reference',
        to: [{ type: 'project' }],
        options: { filter: 'isActive == true' },
      }],
      description: 'Assign to one or more projects. Playlist items in those projects can reference this media.',
      validation: Rule => Rule.required().min(1).error('At least one project is required'),
    }),

    // ── Provider link ─────────────────────────────────────────────────────────
    // Provider must belong to one of the selected projects.
    // Sanity reference filters cannot read sibling array fields dynamically,
    // so cross-field consistency is enforced via async custom() validation below.
    defineField({
      name: 'provider',
      title: 'Provider',
      type: 'reference',
      to: [{ type: 'provider' }],
      description: 'Optional. If set, must belong to one of the selected Projects.',
      validation: Rule =>
        Rule.custom(async (value, context) => {
          if (!value?._ref) return true
          const doc = context.document as any
          const projectRefs: string[] = (doc?.projects ?? []).map((p: any) => p._ref).filter(Boolean)
          if (projectRefs.length === 0) return true
          try {
            const client = context.getClient({ apiVersion: '2024-01-01' })
            const providerProjectRef = await client.fetch<string | null>(
              `*[_id == $id][0].project._ref`,
              { id: value._ref },
            )
            if (providerProjectRef && !projectRefs.includes(providerProjectRef))
              return 'Selected provider does not belong to any of the chosen projects'
          } catch {
            // getClient unavailable in this validation context — skip remote check
          }
          return true
        }),
    }),

    // ── Routing ───────────────────────────────────────────────────────────────
    defineField({
      name: 'category',
      title: 'Category',
      type: 'string',
      description: 'Determines kiosk routing when user taps this media. CTA text is derived from category in the kiosk.',
      options: { list: CATEGORY_LIST },
      validation: Rule => Rule.required(),
    }),

    // ── Schedule — CANONICAL source of truth ──────────────────────────────────
    // playlistItem has no startAt/endAt; schedule is resolved via media reference.
    // Kiosk GROQ: filter where !defined(media->endAt) || media->endAt > now()
    defineField({
      name: 'enabled',
      title: 'Enabled',
      type: 'boolean',
      initialValue: true,
      description: 'Master switch. Disabling here hides this media from ALL playlists.',
    }),
    defineField({
      name: 'startAt',
      title: 'Start At',
      type: 'datetime',
      description: 'Optional — show from this date/time onward.',
    }),
    defineField({
      name: 'endAt',
      title: 'End At',
      type: 'datetime',
      description: 'Optional — stop showing after this date/time.',
      validation: Rule =>
        Rule.custom((value, context) => {
          const { startAt } = context.parent as { startAt?: string }
          if (value && startAt && value <= startAt) return 'End At must be after Start At'
          return true
        }),
    }),

    defineField({
      name: 'notes',
      title: 'Notes (internal)',
      type: 'text',
      rows: 2,
      description: 'Not shown in kiosk. For editorial reference only.',
    }),
  ],

  preview: {
    select: {
      title:        'title',
      type:         'type',
      category:     'category',
      enabled:      'enabled',
      videoAsset:   'videoFile.asset.originalFilename',
      imageAsset:   'imageFile.asset.originalFilename',
      providerName: 'provider.nameEN',
    },
    prepare({ title, type, category, enabled, videoAsset, imageAsset, providerName }) {
      const asset  = videoAsset ?? imageAsset ?? '(no file)'
      const status = enabled === false ? '  ·  DISABLED' : ''
      return {
        title:    `${title ?? '(untitled)'}${status}`,
        subtitle: `[${type ?? '?'}]  ${category ?? '—'}  ·  ${asset}${providerName ? `  ·  ${providerName}` : ''}`,
      }
    },
  },
})
