const path = require('path')
const fs = require('fs-extra')
const chalk = require('chalk')
const { stopSpinner, clearConsole } = require('@nodepack/utils')
const consola = require('consola')
const validateProjectName = require('validate-npm-package-name')
const inquirer = require('inquirer')
const ProjectCreateJob = require('../lib/ProjectCreateJob')
const { getPromptModules } = require('../lib/createModules')

/**
 * @param {string} projectName
 * @param {any} options
 */
async function create (projectName, options) {
  if (options.proxy) {
    process.env.HTTP_PROXY = options.proxy
  }

  const cwd = options.cwd || process.cwd()
  const inCurrent = projectName === '.'
  const name = inCurrent ? path.relative('../', cwd) : projectName
  const targetDir = path.resolve(cwd, projectName || '.')

  // Name validation
  const result = validateProjectName(name)
  if (!result.validForNewPackages) {
    consola.error(chalk.red(`Invalid project name: "${name}"`))
    result.errors && result.errors.forEach(err => {
      consola.error(chalk.red(err))
    })
    process.exit(1)
  }

  // Target folder management
  if (fs.existsSync(targetDir)) {
    if (options.force) {
      await fs.remove(targetDir)
    } else {
      clearConsole()
      if (inCurrent) {
        const { ok } = await inquirer.prompt([
          {
            name: 'ok',
            type: 'confirm',
            message: `Generate project in current directory?`,
          },
        ])
        if (!ok) {
          return
        }
      } else {
        const { action } = await inquirer.prompt([
          {
            name: 'action',
            type: 'list',
            message: `Target directory ${chalk.cyan(targetDir)} already exists. Pick an action:`,
            choices: [
              { name: 'Overwrite', value: 'overwrite' },
              { name: 'Merge', value: 'merge' },
              { name: 'Cancel', value: false },
            ],
          },
        ])
        if (!action) {
          return
        } else if (action === 'overwrite') {
          consola.info(`\nRemoving ${chalk.cyan(targetDir)}...`)
          await fs.remove(targetDir)
        }
      }
    }
  }

  const job = new ProjectCreateJob(name, targetDir, getPromptModules())
  await job.create(options)
}

module.exports = (...args) => {
  // @ts-ignore
  return create(...args).catch(err => {
    stopSpinner(false) // do not persist
    consola.error(`Could not create project`, err.stack || err)
    if (!process.env.NODEPACK_TEST) {
      process.exit(1)
    }
  })
}
