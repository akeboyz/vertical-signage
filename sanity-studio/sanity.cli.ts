import { defineCliConfig } from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: 'awjj9g8u',
    dataset:   'production',
  },
  studioHost: 'vertical-signage',

  // Vite config: exclude FFmpeg from pre-bundling so dynamic imports and
  // new URL() asset references work correctly for WASM loading.
  vite: async (config) => ({
    ...config,
    optimizeDeps: {
      ...(config.optimizeDeps ?? {}),
      exclude: [
        ...(config.optimizeDeps?.exclude ?? []),
        '@ffmpeg/ffmpeg',
        '@ffmpeg/util',
        '@ffmpeg/core-st',
      ],
    },
  }),
})
