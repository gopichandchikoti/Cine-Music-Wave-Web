import HtmlWebpackPlugin from 'html-webpack-plugin'

/**
 * Adds `<link rel="preload" as="font">` for the fonts every first screen needs (body and heading, Latin subset).
 * Fonts are named by content hash, so the tag can only be written once the build knows the final file names.
 * Without it the browser finds the font only after the CSS has been parsed, which delays the first readable paint.
 */
export class PreloadFontsPlugin {
  constructor(pattern) {
    this.pattern = pattern
  }

  apply(compiler) {
    compiler.hooks.thisCompilation.tap('PreloadFontsPlugin', (compilation) => {
      HtmlWebpackPlugin.getHooks(compilation).alterAssetTags.tap('PreloadFontsPlugin', (data) => {
        const fonts = compilation
          .getAssets()
          .map((asset) => asset.name)
          .filter((name) => this.pattern.test(name))
        const tags = fonts.map((name) => ({
          tagName: 'link',
          voidTag: true,
          meta: { plugin: 'PreloadFontsPlugin' },
          attributes: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: '', href: `${data.publicPath}${name}` },
        }))
        data.assetTags.styles = [...tags, ...data.assetTags.styles]
        return data
      })
    })
  }
}
