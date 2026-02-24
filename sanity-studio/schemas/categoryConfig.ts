import { defineField, defineType } from 'sanity'

// One categoryConfig document per project.
// Previously a singleton (fixed _id 'categoryConfig-singleton'); now a
// normal document keyed by project reference so each project can have its
// own category/subcategory tree.
//
// Kiosk GROQ migration note:
//   OLD: *[_type == "categoryConfig" && _id == "categoryConfig-singleton"][0]
//   NEW: *[_type == "categoryConfig" && project._ref == $projectId][0]

export default defineType({
  name: 'categoryConfig',
  title: 'Category Config',
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
  preview: {
    select: { projectTitle: 'project.title', projectCode: 'project.code.current' },
    prepare({ projectTitle, projectCode }) {
      return {
        title:    `Category Config — ${projectTitle ?? '(no project)'}`,
        subtitle: projectCode ? `code: ${projectCode}` : undefined,
      }
    },
  },
})
