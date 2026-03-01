import { defineField, defineType } from 'sanity'

// Must stay in sync with provider.ts, media.ts, playlistItem.ts, categoryConfig.ts
const CATEGORY_LIST = [
  { title: 'Food',             value: 'food' },
  { title: 'Groceries',        value: 'groceries' },
  { title: 'Services',         value: 'services' },
  { title: 'For Rent',         value: 'forRent' },
  { title: 'For Sale',         value: 'forSale' },
  { title: 'Building Updates', value: 'buildingUpdates' },
]

export default defineType({
  name: 'offer',
  title: 'Offer',
  type: 'document',
  fields: [
    // ── Provider ──────────────────────────────────────────────────────────────
    defineField({
      name: 'provider',
      title: 'Provider',
      type: 'reference',
      to: [{ type: 'provider' }],
      options: { filter: 'status != false' },
      validation: Rule => Rule.required(),
    }),

    // ── Scope ─────────────────────────────────────────────────────────────────
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
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'projects',
      title: 'Projects',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'project' }], options: { filter: 'isActive == true' } }],
      hidden: ({ document }) => (document as any)?.scope !== 'project',
      validation: Rule =>
        Rule.custom((value, context) => {
          if ((context.document as any)?.scope !== 'project') return true
          if (!value?.length) return 'At least one project required when scope is Project-specific'
          return true
        }),
    }),

    // ── Identity ─────────────────────────────────────────────────────────────
    defineField({
      name: 'title_th',
      title: 'Title (Thai)',
      type: 'string',
      validation: Rule => Rule.required(),
    }),
    defineField({ name: 'title_en', title: 'Title (English)', type: 'string' }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: { source: 'title_th' },
      validation: Rule => Rule.required(),
      description: 'Used in kiosk deep link /m/{category}/{slug}.',
    }),

    // ── Routing ───────────────────────────────────────────────────────────────
    defineField({
      name: 'category',
      title: 'Category',
      type: 'string',
      options: { list: CATEGORY_LIST },
      validation: Rule => Rule.required(),
      description: 'Drives kiosk routing. PlaylistItem.touchExploreCategory may override per slot.',
    }),
    defineField({
      name: 'subCategories',
      title: 'Sub-Categories',
      type: 'array',
      of: [{ type: 'string' }],
      description: 'Must match string values in this project\'s categoryConfig (e.g. "Dine-in", "Vegan").',
    }),

    // ── Status ────────────────────────────────────────────────────────────────
    defineField({
      name: 'status',
      title: 'Active',
      type: 'boolean',
      initialValue: true,
      description: 'Disable to hide this offer from all kiosk views.',
    }),

    // ── Content ───────────────────────────────────────────────────────────────
    defineField({ name: 'shortDesc_th',   title: 'Short Description (Thai)',    type: 'string' }),
    defineField({ name: 'shortDesc_en',   title: 'Short Description (English)', type: 'string' }),
    defineField({ name: 'description_th', title: 'Description (Thai)',          type: 'text', rows: 3 }),
    defineField({ name: 'description_en', title: 'Description (English)',       type: 'text', rows: 3 }),
    defineField({
      name: 'price',
      title: 'Price',
      type: 'string',
      description: 'e.g. "150", "150–300", "Free", "From ฿99"',
    }),
    defineField({ name: 'primaryImage', title: 'Primary Image', type: 'image', options: { hotspot: true } }),
    defineField({
      name: 'images',
      title: 'Gallery Images',
      type: 'array',
      of: [{ type: 'image', options: { hotspot: true } }],
    }),

    // ── CTA ──────────────────────────────────────────────────────────────────
    defineField({
      name: 'ctaType',
      title: 'CTA Type',
      type: 'string',
      options: {
        list: [
          { title: 'View Menu',    value: 'viewMenu' },
          { title: 'Order',        value: 'order' },
          { title: 'Book',         value: 'book' },
          { title: 'Contact',      value: 'contact' },
          { title: 'View Listing', value: 'viewListing' },
        ],
      },
    }),
    defineField({ name: 'ctaURL',       title: 'CTA URL',   type: 'url' }),
    defineField({ name: 'deepLink',     title: 'Deep Link', type: 'url', description: 'e.g. line://mc/…, intent://…' }),
    defineField({ name: 'availability', title: 'Availability', type: 'string', description: 'e.g. "Mon–Fri 11:00–14:00"' }),
    defineField({ name: 'validFrom',    title: 'Valid From', type: 'datetime' }),
    defineField({ name: 'validTo',      title: 'Valid To',   type: 'datetime' }),
  ],

  preview: {
    select: {
      title:        'title_th',
      category:     'category',
      providerName: 'provider.name_th',
    },
    prepare({ title, category, providerName }) {
      return {
        title:    title ?? '(untitled)',
        subtitle: `${providerName ?? '(no provider)'}  ·  ${category ?? '—'}`,
      }
    },
  },
})
