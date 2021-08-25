import * as fs from 'fs'
import * as yaml from 'js-yaml'
import { registerEnumType } from 'type-graphql'

export enum Role {
  admin = 'admin',
  editor = 'editor',
  writer = 'writer',
  teacher = 'teacher',
  learner = 'learner'
}
registerEnumType(Role, { name: 'Role' })

export enum Gender {
  male = 'male',
  female = 'female',
  other = 'other'
}
registerEnumType(Gender, { name: 'Gender' })

interface Env {
  jwt: {
    rs256_private_key: string
    rs256_public_key: string
    hs256_secret: string
  }
  auth0: {
    domain: string
    auth_domain: string
    client_id: string
    client_secret: string
    connection_id: string
  }
}

const all_env = yaml.load(fs.readFileSync(process.env.ENV_YML, 'utf-8'))
export const stage = process.env.NODE_ENV || 'staging'
console.log({ stage })
export const env: Env = all_env[stage]