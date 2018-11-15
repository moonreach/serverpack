/**
 * @typedef GlobalOptions
 * @prop {string?} [packageManager]
 * @prop {boolean?} [useTaobaoRegistry]
 * @prop {Object.<string, SuggestionSettings>?} [suggestions]
 */
/**
 * @typedef SuggestionSettings
 * @prop {boolean} alwaysApply
 */

const fs = require('fs-extra')
const cloneDeep = require('lodash.clonedeep')
const { getRcPath } = require('./rcPath')
const { error } = require('./logger')
const { createSchema, validate } = require('./validate')

const rcPath = exports.rcPath = getRcPath('.nodepackrc')

const schema = createSchema(joi => joi.object().keys({
  packageManager: joi.string().only(['yarn', 'npm']),
  useTaobaoRegistry: joi.boolean(),
  suggestions: joi.object(),
}))

/** @type {GlobalOptions} */
exports.defaults = {
  packageManager: null,
  useTaobaoRegistry: null,
  suggestions: null,
}

let cachedOptions

/**
 * @returns {GlobalOptions}
 */
exports.loadGlobalOptions = function () {
  if (cachedOptions) {
    return cachedOptions
  }
  if (fs.existsSync(rcPath)) {
    try {
      cachedOptions = fs.readJsonSync(rcPath)
    } catch (e) {
      error(
        `Error loading saved preferences: ` +
        `~/.nodepackrc may be corrupted or have syntax errors. ` +
        `Please fix/delete it and re-run nodepack in manual mode.\n` +
        `(${e.message})`,
      )
      process.exit(1)
    }
    validate(cachedOptions, schema, message => {
      error(
        `~/.nodepackrc may be outdated. ` +
        `Please delete it and re-run nodepack in manual mode.\n` +
        `(${message})`
      )
    })
    return cachedOptions
  } else {
    return {}
  }
}

/**
 * @param {GlobalOptions} toSave
 */
exports.saveGlobalOptions = function (toSave) {
  const options = Object.assign(
    // Current options
    cloneDeep(exports.loadGlobalOptions()),
    toSave
  )
  // Remove invalid keys
  for (const key in options) {
    if (!(key in exports.defaults)) {
      delete options[key]
    }
  }
  cachedOptions = options
  try {
    fs.writeJsonSync(rcPath, options, {
      spaces: 2,
    })
  } catch (e) {
    error(
      `Error saving preferences: ` +
      `make sure you have write access to ${rcPath}.\n` +
      `(${e.message})`
    )
  }
}
