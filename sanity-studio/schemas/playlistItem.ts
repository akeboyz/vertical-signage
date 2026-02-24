import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'playlistItem',
  title: 'Playlist Item',
  type: 'document',
  fields: [
    defineField({ name: 'url',       title: 'Video URL (external MP4 or HLS .m3u8)', type: 'url', description: 'Paste an external URL, OR leave blank and upload a file below.' }),
    defineField({ name: 'videoFile', title: 'Video File (upload MP4)',              type: 'file', description: 'Upload takes priority over URL if both are set.', options: { accept: 'video/*' } }),
    defineField({ name: 'cta_en', title: 'CTA Text (English)',           type: 'string' }),
    defineField({ name: 'cta_th', title: 'CTA Text (Thai)',              type: 'string' }),
    defineField({ name: 'order',  title: 'Play Order',                   type: 'number', validation: Rule => Rule.required().min(1) }),
    defineField({
      name: 'category', title: 'Category (for Touch to Explore routing)', type: 'string',
      description: 'Which category screen opens when the user taps Touch to Explore on this video.',
      options: { list: [
        { title: 'Food',             value: 'food' },
        { title: 'Groceries',        value: 'groceries' },
        { title: 'Services',         value: 'services' },
        { title: 'For Rent',         value: 'rent' },
        { title: 'For Sale',         value: 'sale' },
        { title: 'Building Updates', value: 'building-updates' },
      ]},
    }),
  ],
  orderings: [{
    title: 'Play Order',
    name: 'orderAsc',
    by: [{ field: 'order', direction: 'asc' }],
  }],
  preview: {
    select: { title: 'cta_en', url: 'url', filename: 'videoFile.asset.originalFilename', order: 'order' },
    prepare({ title, url, filename, order }) {
      return { title: `${order}. ${title || '(no CTA)'}`, subtitle: filename || url || '(no source)' }
    },
  },
})
