import { Sequelize, SequelizeOptions } from 'sequelize-typescript'
import { flatten } from 'lodash'
import * as fs from 'fs'
import { stage } from './env'

const parseURL = (): Partial<SequelizeOptions> => {
  const m = /^mysql:\/\/(.*?)(?::(.*?))?@(.*?):(\d+)\/(.*)$/.exec(process.env.DATABASE_URL)
  if (!m) {
    console.error(`missing DATABASE_URL:`, process.env.DATABASE_URL)
    process.exit(0)
  }
  const [, username, password, host, port, database] = m
  return {
    dialect: 'mysql',
    username,
    password,
    host,
    port: Number(port),
    database
  }
}

// const staging_logging = console.log
const staging_logging = false

const db = new Sequelize({
  ...parseURL(),
  logging: stage === 'production' ? false : staging_logging,
  define: {
    timestamps: true,
    underscored: true,
    charset: 'utf8mb4',
  },
  dialectOptions: {
    charset: 'utf8mb4'
  },
  models: flatten(['profile', 'content', 'scheme', 'practice', 'exercise', 'deprecated'].map(d => {
    const dir = `${__dirname}/${d}`
    if (!fs.existsSync(dir)) return []
    const files = fs.readdirSync(dir)
    return files.filter(file => !file.startsWith('index.')).map(file => `${dir}/${file}`)
  }))
})

export default db
