const execa = require('execa')
const chalk = require('chalk')

/**
 * @param {string} folder
 * @returns {Promise}
 */
exports.buildTs = async (folder) => {
  await execa('tsc', [
    '--outDir', 'dist',
    '-d',
  ], {
    cwd: folder,
    preferLocal: true,
    stdio: 'inherit',
  })

  console.log(chalk.green('✔️ Typescript compiled'))

  await execa('copyfiles', [
    '-a',
    '-u', '1',
    'src/{{app-migrations/templates,runtime}/**,context.d.ts}',
    'dist',
  ], {
    cwd: folder,
    preferLocal: true,
    stdio: 'inherit',
  })

  console.log(chalk.green('✔️ Other files copied'))
}
