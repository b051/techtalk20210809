import * as Boom from '@hapi/boom'
import { User } from 'auth0'
import * as jwt from 'jsonwebtoken'
import * as jwkToPem from 'jwk-to-pem'
import * as request from 'superagent'
import * as uuid from 'uuid'
import { getUser } from './auth0'
import { Person, env } from '../models'
import * as crypto from 'crypto'
import * as phc from '@phc/format'

const Bearer = /^Bearer (\S*)$/

/**
 * 
ssh-keygen -t rsa -b 4096 -m PEM -f jwtRS256.key
openssl rsa -in jwtRS256.key -pubout -outform PEM -out jwtRS256.key.pub
 */

const generate_token_rs256 = (payload: object) => {
  return jwt.sign(payload, env.jwt.rs256_private_key, {
    algorithm: 'RS256',
    expiresIn: '1d'
  })
}

const generate_token_hs256 = (payload: string | Buffer | object) => {
  return jwt.sign(payload, env.jwt.hs256_secret, {
    expiresIn: '1d'
  })
}

const verify_token_rs256 = (token: string) => {
  return jwt.verify(token, env.jwt.rs256_public_key) as { sub: string }
}

const verify_token_hs256 = (token: string) => {
  return jwt.verify(token, env.jwt.hs256_secret) as { sub: string }
}

{
  const token = generate_token_hs256({ sub: "1", permissions: 255 })
  console.log("hs256", token)
  const [header, payload, signature] = token.split(".").map(part => Buffer.from(part, 'base64'))
  console.log([header.toString(), payload.toString(), signature.toString('hex')])
  console.log("verify hs256", verify_token_hs256(token))
}

{
  const token = generate_token_rs256({ sub: "1", permissions: 255 })
  console.log("rs256", token)
  const [header, payload, signature] = token.split(".").map(part => Buffer.from(part, 'base64'))
  console.log([header.toString(), payload.toString(), signature.toString('hex')])
  console.log("verify rs256", verify_token_rs256(token))
}

let __pem: string
let __pem_expire: number
const public_key_auth0 = async () => {
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

const verify_token_rs256_auth0 = async (token: string) => {
  const public_key = await public_key_auth0()
  try {
    const payload = jwt.verify(token, public_key, { issuer: `https://${env.auth0.auth_domain}/` })
    return payload as { sub: string, permissions: string[] }
  } catch (error) {
    throw Boom.unauthorized('Invalid token ' + error.message)
  }
}

const hash_pbkdf2 = (password: string) => {
  const salt = crypto.randomBytes(16)
  const iterations = 100_000
  const keylen = 64
  const digest = 'sha512'
  const hash = crypto.pbkdf2Sync(password, salt, iterations, keylen, digest)
  return phc.serialize({
    id: `pbkdf2-${digest}`,
    params: { i: iterations },
    salt,
    hash
  })
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
        const { sub, permissions } = await verify_token_rs256_auth0(token)
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