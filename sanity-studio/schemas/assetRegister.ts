import { defineField, defineType } from 'sanity'

export default defineType({
  name:  'assetRegister',
  title: 'Asset Register',
  type:  'document',
  fields: [
    defineField({
      name:     'placeholder',
      title:    'Asset Register',
      type:     'string',
      hidden:   true,
      readOnly: true,
    }),
  ],
  preview: {
    select:  {},
    prepare: () => ({ title: 'Asset Register' }),
  },
})
