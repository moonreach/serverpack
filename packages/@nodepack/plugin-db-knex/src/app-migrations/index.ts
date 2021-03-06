import { MigrationAPI } from '@nodepack/service'

module.exports = (api: MigrationAPI) => {
  const configTemplate = `./templates/config-${api.hasPlugin('typescript') ? 'ts' : 'js'}`

  api.register({
    id: 'defaultConfig',
    title: 'Template: default config',
    up: (api, options) => {
      api.render(configTemplate, options)
    },
    down: (api, options) => {
      api.unrender(configTemplate)
    },
  })

  api.register({
    id: 'configRename',
    title: 'Rename config file',
    when: api => api.fromVersion('<0.8.0'),
    up: (api, options) => {
      api.move('config/db.{js,ts}', file => `${file.path}knex.${file.ext}`)
    },
    down: (api, options) => {
      api.move('config/knex.{js,ts}', file => `${file.path}db.${file.ext}`)
    },
  })
}
