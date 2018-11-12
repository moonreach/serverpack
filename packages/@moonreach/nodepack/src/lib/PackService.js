/** @typedef {import('./PackPlugin.js')} PackPlugin */
/** @typedef {(config) => void} WebpackChainFns */
/**
 * @typedef CommandOptions
 * @prop {string} [description]
 * @prop {string} [usage]
 * @prop {Object.<string, string>} [options]
 * @prop {string} [details]
 */
/**
 * @typedef {(args: Object.<string, string>, rawArgs: string []) => (Promise | void)} CommandFn
 */
/**
 * @typedef Command
 * @prop {CommandFn} fn
 * @prop {CommandOptions?} opts
 */

const path = require('path')
const fs = require('fs-extra')
const Config = require('webpack-chain')
const cosmiconfig = require('cosmiconfig')
const defaultsDeep = require('lodash.defaultsdeep')
const PackPlugin = require('./PackPlugin')
const PackPluginAPI = require('./PackPluginAPI')
const { warn, error, isPlugin, loadModule } = require('@moonreach/nodepack-utils')
const { readPackageJson } = require('../util/pkgJson.js')

module.exports = class PackService {
  /**
   * @param {string} cwd
   */
  constructor (cwd) {
    this.initialized = false
    this.cwd = cwd

    this.pkg = readPackageJson(cwd)

    /** @type {PackPlugin []} */
    this.plugins = this.resolvePlugins()

    /** @type {WebpackChainFns []} */
    this.webpackChainFns = []

    /** @type {Object.<string, Command>} */
    this.commands = {}

    /** @type {Object.<string, string>} */
    this.defaultEnvs = this.resolveDefaultEnvs()
  }

  resolvePlugins () {
    const idToPlugin = (id, builtin = false) => (new PackPlugin(
      id.replace(/^..\//, 'built-in:'),
      builtin ? require(id) : loadModule(id, this.cwd)
    ))

    const builtInPlugins = [
      '../commands/dev',
      '../commands/build',
      '../commands/help',
      // config plugins are order sensitive
      '../config/base',
      '../config/dev',
      '../config/prod',
    ].map(id => idToPlugin(id, true))

    const projectPlugins = Object.keys(this.pkg.devDependencies || {})
      .concat(Object.keys(this.pkg.dependencies || {}))
      .filter(isPlugin)
      .map(id => {
        if (
          this.pkg.optionalDependencies &&
          id in this.pkg.optionalDependencies
        ) {
          let apply = () => {}
          try {
            apply = loadModule(id, this.cwd)
          } catch (e) {
            warn(`Optional dependency ${id} is not installed.`)
          }

          return new PackPlugin(id, apply)
        } else {
          return idToPlugin(id)
        }
      })

    const plugins = builtInPlugins.concat(projectPlugins)

    return plugins
  }

  resolveDefaultEnvs () {
    return this.plugins.reduce((
      envs,
      // @ts-ignore
      { apply: { defaultEnvs }}
    ) => {
      return Object.assign(envs, defaultEnvs)
    }, {})
  }

  /**
   * @param {string} env
   */
  init (env) {
    if (this.initialized) return

    this.env = env

    if (env) {
      this.loadEnv(env)
    }
    this.loadEnv()

    this.projectOptions = this.loadConfig()

    // apply plugins.
    this.plugins.forEach(({ id, apply }) => {
      apply(new PackPluginAPI(id, this), this.projectOptions)
    })

    // apply webpack configs from project config file
    if (this.projectOptions.chainWebpack) {
      this.webpackChainFns.push(this.projectOptions.chainWebpack)
    }

    this.initialized = true
  }

  /**
   * @private
   */
  loadEnv (env) {
    const dotenv = require('dotenv')

    const basePath = path.resolve(this.cwd, `.env${env ? `.${env}` : ``}`)
    const localPath = `${basePath}.local`

    const load = filePath => {
      if (fs.existsSync(filePath)) {
        try {
          const vars = dotenv.parse(fs.readFileSync(filePath, { encoding: 'utf8' }))
          for (var k in vars) {
            if (process.env.OVERRIDE_ENV || typeof process.env[k] === 'undefined') {
              process.env[k] = vars[k]
            }
          }
        } catch (e) {
          error(e)
        }
      }
    }

    load(localPath)
    load(basePath)

    // by default, NODE_ENV and BABEL_ENV are set to "development" unless env
    // is production or test. However the value in .env files will take higher
    // priority.
    if (env) {
      // always set NODE_ENV during tests
      // as that is necessary for tests to not be affected by each other
      const shouldForceDefaultEnv = (
        process.env.NODEPACK_TEST &&
        !process.env.NODEPACK_TEST_TESTING_ENV
      )
      const defaultNodeEnv = (env === 'production' || env === 'test')
        ? env
        : 'development'
      if (shouldForceDefaultEnv || process.env.NODE_ENV == null) {
        process.env.NODE_ENV = defaultNodeEnv
      }
      if (shouldForceDefaultEnv || process.env.BABEL_ENV == null) {
        process.env.BABEL_ENV = defaultNodeEnv
      }
    }
  }

  /**
   * @private
   */
  loadConfig () {
    let options
    const explorer = cosmiconfig('nodepack')
    const result = explorer.searchSync(this.cwd)
    if (!result || result.isEmpty) {
      options = defaultOptions()
    } else {
      options = defaultsDeep(result.config, defaultOptions())
    }
    return options
  }

  async run (name, args = {}, rawArgv = []) {
    // resolve env
    // prioritize inline --env
    // fallback to resolved default envs from plugins or development
    const env = args.env || this.defaultEnvs[name] || 'development'

    // load env variables, load user config, apply plugins
    this.init(env)

    args._ = args._ || []
    let command = this.commands[name]
    if (!command && name) {
      error(`command "${name}" does not exist.`)
      process.exit(1)
    }
    if (!command || args.help) {
      command = this.commands.help
    } else {
      args._.shift() // remove command itself
      rawArgv.shift()
    }
    const { fn } = command
    return fn(args, rawArgv)
  }

  resolveChainableWebpackConfig () {
    const chainableConfig = new Config()
    // apply chains
    this.webpackChainFns.forEach(fn => fn(chainableConfig))
    return chainableConfig
  }

  resolveWebpackConfig (chainableConfig = this.resolveChainableWebpackConfig()) {
    if (!this.initialized) {
      throw new Error('Service must call init() before calling resolveWebpackConfig().')
    }
    // get raw config
    return chainableConfig.toConfig()
  }
}

function defaultOptions () {
  return {
    // TODO default options
    outputDir: 'dist',
    srcDir: 'src',
    productionSourceMap: false,
  }
}
