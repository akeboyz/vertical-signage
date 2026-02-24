import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'provider',
  title: 'Provider',
  type: 'document',
  fields: [
    // ── Project scope ──────────────────────────────────────────────────────
    defineField({
      name: 'project',
      title: 'Project',
      type: 'reference',
      to: [{ type: 'project' }],
      validation: Rule => Rule.required(),
      options: { filter: 'isActive == true' },
    }),

    defineField({ name: 'nameEN', title: 'Name (English)', type: 'string', validation: Rule => Rule.required() }),
    defineField({ name: 'nameTH', title: 'Name (Thai)', type: 'string' }),
    defineField({ name: 'slug', title: 'Slug', type: 'slug', options: { source: 'nameEN' }, validation: Rule => Rule.required() }),
    defineField({
      name: 'category', title: 'Category', type: 'string',
      options: { list: [
        { title: 'Food',        value: 'food' },
        { title: 'Groceries',   value: 'groceries' },
        { title: 'Services',    value: 'services' },
        { title: 'For Rent',    value: 'rent' },
        { title: 'For Sale',    value: 'sale' },
      ]},
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'subCategoryIds', title: 'Sub-Categories', type: 'array',
      of: [{ type: 'string' }],
      description: 'IDs from category-config.json (e.g. dine_in, delivery, most_recent)',
    }),
    defineField({ name: 'icon',        title: 'Icon (emoji)',           type: 'string' }),
    defineField({ name: 'coverColor',  title: 'Cover Color (hex)',      type: 'string', description: 'e.g. #5C1010' }),
    defineField({ name: 'description', title: 'Description', type: 'text', rows: 3 }),
    defineField({
      name: 'details',
      title: 'Details',
      type: 'array',
      description: 'Flexible label/value rows shown in the kiosk popup. Use emojis as labels (e.g. 📍 → G Floor, 🕐 → 10:00–22:00, 📞 → 02-xxx-xxxx).',
      of: [{
        type: 'object',
        fields: [
          defineField({ name: 'label', title: 'Label', type: 'string', description: 'Short label or emoji prefix' }),
          defineField({ name: 'value', title: 'Value', type: 'string' }),
        ],
        preview: { select: { title: 'label', subtitle: 'value' } },
      }],
    }),
    defineField({
      name: 'media',
      title: 'Media Files',
      type: 'array',
      description: 'Upload promo images (JPG/PNG) or videos (MP4). Sanity generates a CDN URL for each file automatically.',
      of: [{
        type: 'object',
        fields: [
          defineField({ name: 'title', title: 'Title / Caption', type: 'string' }),
          defineField({
            name: 'file',
            title: 'File',
            type: 'file',
            description: 'Accepts MP4, JPG, PNG, GIF, etc.',
            options: { accept: 'image/*,video/*' },
          }),
        ],
        preview: {
          select: { title: 'title', filename: 'file.asset.originalFilename' },
          prepare({ title, filename }) {
            return { title: title || filename || 'Untitled', subtitle: filename }
          },
        },
      }],
    }),
  ],
  preview: {
    select: { title: 'nameEN', subtitle: 'category' },
    prepare({ title, subtitle }) {
      return { title, subtitle: subtitle?.toUpperCase() }
    },
  },
})
