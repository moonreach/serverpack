/** @typedef {import('../lib/PackPlugin.js').PackPluginApply} PackPluginApply */

const defaultArgs = {
  clean: true,
}

/** @type {PackPluginApply} */
module.exports = (api, options) => {
  api.registerCommand('build', {
    description: 'Build the app for production',
    usage: 'nodepack build [entry]',
    options: {
      '--no-clean': 'do not delete the dist folder before building',
    },
  }, async (args) => {
    // Default args
    for (const key in defaultArgs) {
      if (args[key] == null) {
        args[key] = defaultArgs[key]
      }
    }

    const { info, error, done, log, chalk } = require('@moonreach/nodepack-utils')

    info(chalk.blue('Preparing production pack...'))

    if (args._ && typeof args._[0] === 'string') {
      options.entry = args._[0]
    } else if (!options.entry) {
      const { getDefaultEntry } = require('../util/defaultEntry.js')
      options.entry = getDefaultEntry(api.getCwd())
    }

    const webpack = require('webpack')
    const path = require('path')
    const fs = require('fs-extra')
    const formatStats = require('../util/formatStats')

    const webpackConfig = api.resolveWebpackConfig()
    const targetDir = webpackConfig.output.path

    if (args.clean) {
      await fs.remove(targetDir)
    }

    return new Promise((resolve, reject) => {
      const compiler = webpack(webpackConfig)
      compiler.run(
        (err, stats) => {
          if (err) {
            error(err)
          } else {
            if (stats.hasErrors()) {
              return reject(`Build failed with errors.`)
            }

            const targetDirShort = path.relative(
              api.service.cwd,
              targetDir
            )
            log(formatStats(stats, targetDirShort, api))

            done(chalk.green('Build complete! Your app is ready for production.'))
            resolve()
          }
        }
      )
    })
  })
}

// @ts-ignore
module.exports.defaultEnvs = {
  build: 'production',
}
