import { defineField, defineType } from 'sanity'
import { ExcludedProjectsInput } from '../components/ExcludedProjectsInput'

// category field removed from media — category now lives on offer.
// schedule (startAt/endAt) removed from media — scheduling consolidated on playlistItem.

export default defineType({
  name: 'media',
  title: 'Media',
  type: 'document',
  fields: [
    // ── Kind ─────────────────────────────────────────────────────────────────
    // promo  → asset + offer link; appears in playlist.
    // notice → building update / alert; queried separately; offer is optional.
    defineField({
      name: 'kind',
      title: 'Kind',
      type: 'string',
      options: {
        list: [
          { title: 'Promo (playlist content)',        value: 'promo' },
          { title: 'Notice (building update / alert)', value: 'notice' },
        ],
        layout: 'radio',
      },
      initialValue: 'promo',
      validation: Rule => Rule.required(),
    }),

    // ── Identity ─────────────────────────────────────────────────────────────
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: Rule => Rule.required(),
    }),

    // ── Asset type + files (promo only) ──────────────────────────────────────
    // Two separate fields preserve Sanity CDN image transforms (crop, hotspot) for images.
    defineField({
      name: 'type',
      title: 'Type',
      type: 'string',
      options: {
        list: [
          { title: 'Video (MP4)',       value: 'video' },
          { title: 'Image (JPG / PNG)', value: 'image' },
        ],
        layout: 'radio',
      },
      hidden: ({ document }) => (document as any)?.kind !== 'promo',
      validation: Rule =>
        Rule.custom((value, context) => {
          if ((context.document as any)?.kind === 'promo' && !value)
            return 'Type is required for promo media'
          return true
        }),
    }),
    defineField({
      name: 'videoFile',
      title: 'Video File (MP4)',
      type: 'file',
      options: { accept: 'video/*' },
      hidden: ({ document }) => {
        const doc = document as any
        return doc?.kind !== 'promo' || doc?.type !== 'video'
      },
      validation: Rule =>
        Rule.custom((value, context) => {
          const doc = context.document as any
          if (doc?.kind === 'promo' && doc?.type === 'video' && !value)
            return 'Video file is required when Type is Video'
          return true
        }),
    }),
    defineField({
      name: 'imageFile',
      title: 'Image File (JPG / PNG)',
      type: 'image',
      options: { accept: 'image/*', hotspot: true },
      hidden: ({ document }) => {
        const doc = document as any
        return doc?.kind !== 'promo' || doc?.type !== 'image'
      },
      validation: Rule =>
        Rule.custom((value, context) => {
          const doc = context.document as any
          if (doc?.kind === 'promo' && doc?.type === 'image' && !value)
            return 'Image file is required when Type is Image'
          return true
        }),
    }),

    // ── Default duration (promo image only) ──────────────────────────────────
    // Resolution: playlistItem.displayDuration ?? media.defaultImageDuration ?? 10
    // Videos use intrinsic duration.
    defineField({
      name: 'defaultImageDuration',
      title: 'Default Display Duration (seconds)',
      type: 'number',
      initialValue: 10,
      hidden: ({ document }) => {
        const doc = document as any
        return doc?.kind !== 'promo' || doc?.type !== 'image'
      },
      description: 'Override per slot via PlaylistItem.displayDuration.',
      validation: Rule => Rule.min(1).max(300),
    }),

    // ── Offer link (promo only; optional for notices) ─────────────────────────
    defineField({
      name: 'offer',
      title: 'Offer',
      type: 'reference',
      to: [{ type: 'offer' }],
      hidden: ({ document }) => (document as any)?.kind !== 'promo',
      validation: Rule =>
        Rule.custom((value, context) => {
          if ((context.document as any)?.kind === 'promo' && !value?._ref)
            return 'Offer is required for promo media'
          return true
        }),
      description: 'Required for promo. Links this asset to its offer → provider chain.',
    }),

    // ── Provider (convenience shortcut) ──────────────────────────────────────
    defineField({
      name: 'provider',
      title: 'Provider (convenience)',
      type: 'reference',
      to: [{ type: 'provider' }],
      description: 'Optional. Offer already carries the provider reference.',
    }),

    // ── Scope ─────────────────────────────────────────────────────────────────
    // Notices are always project-specific — scope is hidden for them.
    defineField({
      name: 'scope',
      title: 'Scope',
      type: 'string',
      options: {
        list: [
          { title: 'Global (all projects)', value: 'global' },
          { title: 'Project-specific',      value: 'project' },
        ],
        layout: 'radio',
      },
      initialValue: 'global',
      hidden: ({ document }) => (document as any)?.kind === 'notice',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'projects',
      title: 'Projects',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'project' }], options: { filter: 'isActive == true' } }],
      hidden: ({ document }) => {
        const doc = document as any
        return doc?.kind !== 'notice' && doc?.scope !== 'project'
      },
      description: 'Notices: select exactly one project. Promo: select one or more when Scope is Project-specific.',
      validation: Rule =>
        Rule.custom((value, context) => {
          const doc = context.document as any
          if (doc?.kind === 'notice') {
            if (!value?.length) return 'A notice must target one project'
            if (value.length > 1) return 'A notice can only target one project'
            return true
          }
          if (doc?.scope === 'project' && !value?.length)
            return 'At least one project is required (or change Scope to Global)'
          return true
        }),
    }),

    // ── Active switch ─────────────────────────────────────────────────────────
    defineField({
      name: 'isActive',
      title: 'Active',
      type: 'boolean',
      initialValue: true,
      description: 'Master switch. Disabling hides this media from ALL playlists.',
    }),

    // ── Playlist auto-slot ────────────────────────────────────────────────────
    // Applies to both promo and notice.
    // initialValue=false: opt-in; avoids accidental duplicate slots on re-publish.
    defineField({
      name: 'addToPlaylistOnPublish',
      title: 'Add to Playlist on Publish',
      type: 'boolean',
      initialValue: false,
      description:
        'When published, automatically create a playlist slot for the target projects. ' +
        'Notice → targets the Projects field above. ' +
        'Promo / Scope=Project → targets the Projects field above (all selected). ' +
        'Promo / Scope=Global  → targets ALL active projects; use "Excluded Projects" below to opt-out specific ones.',
    }),

    // Exclude-based project selector — global promo only.
    // All active projects are implicitly included; this field stores the ones to skip.
    // Custom checklist input: pre-checked = included, unchecked = excluded.
    // Hidden for notices (they always use projects[] directly, not global scope).
    defineField({
      name: 'excludedProjects',
      title: 'Excluded Projects',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'project' }], options: { filter: 'isActive == true' } }],
      hidden: ({ document }) => {
        const doc = document as any
        return !doc?.addToPlaylistOnPublish || doc?.scope !== 'global' || doc?.kind === 'notice'
      },
      description:
        'Global scope only. All active projects are included by default — ' +
        'uncheck any project here to exclude it from the auto-add.',
      components: { input: ExcludedProjectsInput },
    }),

    // ── Extra metadata ────────────────────────────────────────────────────────
    defineField({
      name: 'posterImage',
      title: 'Poster Image',
      type: 'image',
      options: { hotspot: true },
      description: 'Fallback thumbnail shown before video loads, or in media pickers.',
    }),
    defineField({
      name: 'altText',
      title: 'Alt Text',
      type: 'string',
      description: 'Accessibility label for this asset.',
    }),
    defineField({
      name: 'tags',
      title: 'Tags',
      type: 'array',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
    }),
  ],

  preview: {
    select: {
      title:      'title',
      kind:       'kind',
      type:       'type',
      isActive:   'isActive',
      videoAsset: 'videoFile.asset.originalFilename',
      imageAsset: 'imageFile.asset.originalFilename',
      offerTitle: 'offer.title_th',
    },
    prepare({ title, kind, type, isActive, videoAsset, imageAsset, offerTitle }) {
      const status = isActive === false ? '  ·  DISABLED' : ''
      if (kind === 'notice') {
        return {
          title:    `[NOTICE] ${title ?? '(untitled)'}${status}`,
          subtitle: 'Project-specific notice',
        }
      }
      const asset = videoAsset ?? imageAsset ?? '(no file)'
      return {
        title:    `${title ?? '(untitled)'}${status}`,
        subtitle: `[${kind ?? '?'}/${type ?? '—'}]  ·  ${asset}${offerTitle ? `  ·  ${offerTitle}` : ''}`,
      }
    },
  },
})
