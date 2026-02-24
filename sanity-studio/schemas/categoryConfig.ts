import { defineField, defineType } from 'sanity'

// Singleton document — only one record of this type should exist.
// In the studio, use a custom structure builder (see sanity.config.ts) to hide
// the "Create new" button and always open the single document directly.

export default defineType({
  name: 'categoryConfig',
  title: 'Category Config',
  type: 'document',
  fields: [
    defineField({
      name: 'categories',
      title: 'Categories',
      type: 'array',
      of: [{
        type: 'object',
        name: 'categoryEntry',
        fields: [
          defineField({ name: 'id',    title: 'Category ID',  type: 'string', description: 'e.g. food, groceries, rent, updates' }),
          defineField({ name: 'label', title: 'Label', type: 'object', fields: [
            defineField({ name: 'en', title: 'English', type: 'string' }),
            defineField({ name: 'th', title: 'Thai',    type: 'string' }),
          ]}),
          defineField({ name: 'ctaItem', title: 'CTA Button Label', type: 'object', fields: [
            defineField({ name: 'en', title: 'English', type: 'string' }),
            defineField({ name: 'th', title: 'Thai',    type: 'string' }),
          ]}),
          defineField({ name: 'fallbackSubcategoryId', title: 'Fallback Sub-Category ID', type: 'string' }),
          defineField({
            name: 'subcategories',
            title: 'Sub-Categories',
            type: 'array',
            of: [{
              type: 'object',
              name: 'subcategoryEntry',
              fields: [
                defineField({ name: 'id',    title: 'Sub-Category ID', type: 'string' }),
                defineField({ name: 'label', title: 'Label', type: 'object', fields: [
                  defineField({ name: 'en', title: 'English', type: 'string' }),
                  defineField({ name: 'th', title: 'Thai',    type: 'string' }),
                ]}),
                defineField({ name: 'order', title: 'Display Order', type: 'number' }),
              ],
              preview: { select: { title: 'label.en', subtitle: 'id' } },
            }],
          }),
        ],
        preview: { select: { title: 'label.en', subtitle: 'id' } },
      }],
    }),
  ],
  preview: { prepare: () => ({ title: 'Category Config (singleton)' }) },
})
