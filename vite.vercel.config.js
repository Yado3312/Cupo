import { mergeConfig } from 'vite'
import baseConfig from './vite.config.js'

export default mergeConfig(baseConfig, {
  publicDir: false,
  build: {
    outDir: 'public',
    emptyOutDir: false,
  },
})