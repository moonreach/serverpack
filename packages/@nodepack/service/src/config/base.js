const path = require('path')

/** @type {import('../../types/ServicePlugin').ServicePlugin} */
module.exports = (api, options) => {
  const resolveLocal = require('../util/resolveLocal')
  const { SUPPORTED_EXTENSIONS } = require('../const')

  api.chainWebpack(config => {
    // Basics
    config
      .target('node')
      .context(api.getCwd())

    // Fragments
    const fragments = {
      config: path.resolve(__dirname, '../runtime/fragments/config.js'),
      context: path.resolve(__dirname, '../runtime/fragments/context.js'),
      runtime: path.resolve(__dirname, '../runtime/fragments/runtime.js'),
    }

    // App entries
    const appEntries = {}
    if (options.entries) {
      for (const key in options.entries) {
        appEntries[key] = api.resolve(options.entries[key])
      }
    } else {
      appEntries.app = api.resolve(options.entry || 'index.js')
    }

    // Entry
    const entries = {
      ...fragments,
      ...appEntries,
    }
    let includedEntries = null
    if (process.env.NODEPACK_ENTRIES) {
      includedEntries = process.env.NODEPACK_ENTRIES.replace(/\s/g, '').split(',')
    }
    for (const key in entries) {
      if (!includedEntries || includedEntries.includes(key)) {
        const entry = config.entry(key)

        // Augment entries
        if (options.productionSourceMap || process.env.NODE_ENV !== 'production') {
          entry.add(path.resolve(__dirname, '../runtime/sourcemap.js'))
        }
        entry.add(path.resolve(__dirname, '../runtime/paths.js'))

        // Fragments handling
        if (key === 'runtime') {
          for (const runtimeModule of api.service.runtimeModules) {
            entry.add(runtimeModule)
          }
        } else if (key !== 'config') {
          entry.add(path.resolve(__dirname, '../runtime/load-runtime.js'))
        }

        // Entry
        if (entries[key]) {
          entry.add(entries[key])
        }
      }
    }

    // Disable node polyfills
    config.set('node', false)

    // Output
    const outputPath = process.env.NODEPACK_DIRNAME = api.resolve(
      process.env.NODEPACK_OUTPUT || options.outputDir || 'dist',
    )
    config.output
      .set('path', outputPath)
      .set('filename', '[name].js')
      .set('libraryTarget', 'commonjs2')
      .set('globalObject', 'this')

    // Resolve
    config.resolve
      .extensions.clear()
      .merge(SUPPORTED_EXTENSIONS)
      .end()
      .modules
      .add('node_modules')
      .add(api.resolve('node_modules'))
      .add(resolveLocal('node_modules'))
      .end()
      .alias
      .set('@root', api.resolve('.'))
      .set('@config', api.resolve('config'))
      .set('@', api.resolve(options.srcDir || 'src'))
      .end()
      // webpack defaults to `module` and `main`, but that's
      // not really what node.js supports, so we reset it
      .mainFields.clear()
      .add('main')
      .end()

    // Loader resolve
    config.resolveLoader
      .modules
      .add('node_modules')
      .add(api.resolve('node_modules'))
      .add(resolveLocal('node_modules'))

    // See https://github.com/graphql/graphql-js/issues/1272
    config.module
      .rule('mjs$')
      .test(/\.mjs$/)
      .include
      .add(/node_modules/)
      .end()
      // @ts-ignore
      .type('javascript/auto')

    // Module
    config.module
      .set('exprContextCritical', true)
      // Allow usage of native require (instead of webpack require)
      .set('noParse', /\/native-require.js$/)

    // External modules (default are modules in package.json deps)
    const nodeExternals = require('webpack-node-externals')
    const findUp = require('find-up')
    const externalsConfig = {
      whitelist: options.nodeExternalsWhitelist || [
        /\.(eot|woff|woff2|ttf|otf)$/,
        /\.(svg|png|jpg|jpeg|gif|ico|webm)$/,
        /\.(mp4|mp3|ogg|swf|webp)$/,
        /\.(css|scss|sass|less|styl)$/,
      ],
    }
    const externals = [
      // Read from package.json
      nodeExternals({
        ...externalsConfig,
        modulesFromFile: true,
      }),
    ]
    let cwd = api.getCwd()
    let folder
    // Find all node_modules folders (to support monorepos)
    do {
      folder = findUp.sync('node_modules', {
        cwd,
        type: 'directory',
      })
      if (folder) {
        externals.push(nodeExternals({
          ...externalsConfig,
          modulesDir: folder,
        }))
        cwd = path.resolve(folder, '../..')
      }
    } while (folder)
    config.externals(externals)

    // Plugins
    const resolveClientEnv = require('../util/resolveClientEnv')
    const envVars = {
      ...resolveClientEnv(options),
      'process.env.NODEPACK_ROOT': JSON.stringify(api.getCwd()),
      'process.env.NODEPACK_MAINTENANCE_FRAGMENTS': process.env.NODEPACK_MAINTENANCE_FRAGMENTS === 'true',
    }
    config
      .plugin('define')
    // @ts-ignore
      .use(require('webpack/lib/DefinePlugin'), [
        envVars,
      ])

    // Others
    config.stats('minimal')
    config.performance.set('hints', false)
    config.optimization.nodeEnv(false)
    config.optimization.concatenateModules(false)
    config.optimization.splitChunks({
      chunks: 'all',
      maxInitialRequests: 2,
      cacheGroups: {
        vendors: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
          reuseExistingChunk: true,
        },
      },
    })
    config.watchOptions({
      ignored: [
        '**/.git',
        '**/.nodepack',
        '**/temp',
        // Cache-loader
        '**/node_modules/.cache',
        // Prevent reload because of `chmod`
        '**/node_modules/@nodepack',
      ],
    })

    // Persistant cache
    const hash = require('hash-sum')
    config.cache({
      type: 'filesystem',
      name: `env-${api.service.env}-${process.env.NODE_ENV}`,
      version: hash(envVars),
      buildDependencies: {
        defaultConfig: [api.service.configPath],
        nodepack: [path.resolve(__dirname, '../../') + '/'],
      },
    })
  })
}
