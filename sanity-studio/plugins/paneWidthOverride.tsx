import { definePlugin } from 'sanity'

const CSS = `
  /* Index 0 is always the root nav list — safe to constrain globally. */
  [data-pane-index="0"] {
    min-width: 180px !important;
    max-width: 200px !important;
  }

  /* Index 1+ can be a document form when navigating via a direct URL (__edit__).
     Only constrain panes that contain our custom nav components (data-narrow-pane).
     Document forms have no such attribute so they are never squished. */
  [data-pane-index="1"]:has([data-narrow-pane="true"]),
  [data-pane-index="2"]:has([data-narrow-pane="true"]),
  [data-pane-index="3"]:has([data-narrow-pane="true"]) {
    min-width: 200px !important;
    max-width: 240px !important;
  }
`

export const paneWidthOverride = definePlugin({
  name: 'pane-width-override',
  studio: {
    components: {
      layout: ({ renderDefault, ...props }: any) => (
        <>
          <style>{CSS}</style>
          {renderDefault(props)}
        </>
      ),
    },
  },
})
