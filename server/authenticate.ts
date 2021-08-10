import * as Boom from '@hapi/boom'
import { User } from 'auth0'
import * as jwk from 'jsonwebtoken'
import * as jwkToPem from 'jwk-to-pem'
import * as request from 'superagent'
import * as uuid from 'uuid'
import { getUser } from './auth0'
import { Person, env } from '../models'

const Bearer = /^Bearer (\S*)$/

const verify_private = (token: string) => {
  return jwk.verify(token, env.private_secret) as { sub: string }
}

let __pem: string
let __pem_expire: number
const pem = async () => {
  if (__pem && __pem_expire > Date.now()) {
    return __pem
  }
  const { body: { keys } } = await request(`https://${env.auth0.auth_domain}/.well-known/jwks.json`)
  const k = keys[0]
  __pem = jwkToPem({
    kty: k.kty,
    n: k.n,
    e: k.e,
  })
  __pem_expire = Date.now() + 3600_000
  return __pem
}

const verify = async (token: string) => {
  const secret = await pem()
  try {
    const payload = jwk.verify(token, secret, { issuer: `https://${env.auth0.auth_domain}/` })
    return payload as { sub: string, permissions: string[] }
  } catch (error) {
    throw Boom.unauthorized('Invalid token ' + error.message)
  }
}

export interface Context {
  uuid: string
  person?: Person
  user?: User
  permissions?: string[]
}

export const context = async (ctx: any) => {
  const context: Context = {
    uuid: uuid.v4()
  }
  if (!ctx.state.person) {
    if (ctx.header && ctx.header.authorization) {
      const m = Bearer.exec(ctx.header.authorization)
      if (m) {
        const token = m[1]
        const { sub, permissions } = await verify(token)
        const user = await getUser(sub, true)
        if (!user) {
          throw Boom.notFound('Person not found')
        }
        const person = await Person.findOrCreateFromUser(user)
        ctx.state.person = person
        context.person = person
        ctx.state.user = user
        context.user = user
        ctx.state.permissions = permissions
        context.permissions = permissions
      }
    }
  } else {
    context.person = ctx.state.person
    context.user = ctx.state.user
    context.permissions = ctx.state.permissions
  }
  
  return context
}