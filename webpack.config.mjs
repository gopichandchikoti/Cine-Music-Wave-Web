import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import MiniCssExtractPlugin from 'mini-css-extract-plugin'
import webpack from 'webpack'
import { PreloadFontsPlugin } from './scripts/webpack/preload-fonts-plugin.mjs'

const { DefinePlugin } = webpack

const currentFile = fileURLToPath(import.meta.url)
const projectRoot = path.dirname(currentFile)
const content = JSON.parse(readFileSync(path.join(projectRoot, 'src/content.model.json'), 'utf8'))
const apiOrigin = process.env.API_ORIGIN ?? process.env.VITE_API_ORIGIN ?? ''
const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]'])
// Cookies are per host, and the server only accepts the exact AUTH_PUBLIC_ORIGIN. Opening the dev server through another
// loopback name (webpack prints http://127.0.0.1:4040) would look signed out and reject every sign-in, so redirect it.
const canonicalDevOrigin = (() => {
  try {
    const origin = new URL(process.env.AUTH_PUBLIC_ORIGIN ?? 'http://localhost:4040')
    return origin.protocol === 'http:' && loopbackHosts.has(origin.hostname) ? origin : null
  } catch {
    return null
  }
})()
const redirectToCanonicalDevOrigin = (request, response, next) => {
  if (!canonicalDevOrigin || !['GET', 'HEAD'].includes(request.method)) {
    next()
    return
  }
  let requested
  try {
    requested = new URL('http://' + (request.headers.host ?? ''))
  } catch {
    next()
    return
  }
  const port = requested.port || '80'
  if (
    !loopbackHosts.has(requested.hostname) ||
    requested.hostname === canonicalDevOrigin.hostname ||
    port !== (canonicalDevOrigin.port || '80')
  ) {
    next()
    return
  }
  response.redirect(302, canonicalDevOrigin.origin + request.url)
}

// Development only: webpack's own server needs eval for hot reload and a WebSocket back to itself. Production uses
// server/auth/security-headers.ts, which is stricter. Fonts are self-hosted, so no third-party origin is allowed.
const developmentPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self' ws://localhost:4040 ws://127.0.0.1:4040",
  "frame-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
].join('; ')

// The Latin subset of the body and heading fonts is needed by every first screen, so it is preloaded.
const criticalFonts = /(?:dm-sans|fraunces)-latin-(?:wght|opsz)-normal\.[0-9a-f]{8}\.woff2$/

export default (_env = {}, argv = {}) => {
  const isProduction = (argv.mode ?? process.env.NODE_ENV) === 'production'
  return {
    mode: isProduction ? 'production' : 'development',
    entry: path.resolve(projectRoot, 'src/main.tsx'),
    output: {
      path: path.resolve(projectRoot, 'dist'),
      filename: isProduction ? 'assets/[name].[contenthash:8].js' : 'assets/[name].js',
      chunkFilename: isProduction ? 'assets/[name].[contenthash:8].chunk.js' : 'assets/[name].chunk.js',
      assetModuleFilename: 'assets/[name].[contenthash:8][ext]',
      publicPath: '/',
      clean: true,
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.jsx', '.js'],
      extensionAlias: { '.js': ['.js', '.ts', '.tsx'] },
    },
    module: {
      rules: [
        {
          // Plain TypeScript has no JSX, so it is parsed without the React preset. With it, `<T,>(...) =>` and `<T = X>(...)` would be
          // read as JSX tags, and the formatter writes generics without the trailing comma that works around that.
          test: /\.ts$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: { presets: [['@babel/preset-env', { targets: 'defaults', modules: false }], '@babel/preset-typescript'] },
          },
        },
        {
          test: /\.tsx$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                ['@babel/preset-env', { targets: 'defaults', modules: false }],
                // Without this, Babel picks dev or prod JSX from NODE_ENV, and a production bundle built with NODE_ENV unset crashes (jsxDEV is not a function).
                ['@babel/preset-react', { runtime: 'automatic', development: !isProduction }],
                '@babel/preset-typescript',
              ],
            },
          },
        },
        {
          // Production writes real .css files, so styles load in parallel with the scripts and the first paint is styled.
          // Development keeps style-loader for hot reload.
          test: /\.css$/i,
          use: [isProduction ? MiniCssExtractPlugin.loader : 'style-loader', 'css-loader'],
        },
        {
          test: /\.(png|jpe?g|gif|webp|svg|avif|woff2?)$/i,
          type: 'asset/resource',
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: path.resolve(projectRoot, 'index.html'),
        templateParameters: { content, apiOrigin },
        favicon: path.resolve(projectRoot, 'public/favicon.svg'),
        scriptLoading: 'defer',
        minify: isProduction,
      }),
      ...(isProduction
        ? [
            new MiniCssExtractPlugin({
              filename: 'assets/[name].[contenthash:8].css',
              chunkFilename: 'assets/[name].[contenthash:8].chunk.css',
            }),
            new PreloadFontsPlugin(criticalFonts),
          ]
        : []),
      new DefinePlugin({
        __API_ORIGIN__: JSON.stringify(apiOrigin),
        __LIBRARY_LOADING_TEXT__: JSON.stringify(content.appLoader.openingYourLibrary),
      }),
    ],
    optimization: {
      splitChunks: {
        chunks: 'all',
        maxSize: 200000,
      },
    },
    // Hidden maps are written for error tooling but are not linked from the bundles and the server does not serve them.
    devtool: isProduction ? 'hidden-source-map' : 'eval-cheap-module-source-map',
    performance: {
      hints: isProduction ? 'warning' : false,
    },
    devServer: {
      host: process.env.STUDY_WEB_HOST ?? '127.0.0.1',
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'same-origin',
        'Content-Security-Policy': developmentPolicy,
      },
      port: 4040,
      hot: true,
      historyApiFallback: true,
      setupMiddlewares: (middlewares) => [
        { name: 'canonical-dev-origin', middleware: redirectToCanonicalDevOrigin },
        ...middlewares,
      ],
      static: {
        directory: path.resolve(projectRoot, 'public'),
      },
      proxy: [
        {
          context: ['/api'],
          target: 'http://localhost:4041',
          changeOrigin: true,
        },
      ],
    },
  }
}
