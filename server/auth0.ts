import { AppMetadata, ManagementClient, UpdateUserData, User, UserMetadata, UserPage } from 'auth0'
import { Max, Min } from 'class-validator'
import { chunk } from 'lodash'
import * as moment from 'moment'
import { pRateLimit } from 'p-ratelimit'
import { ArgsType, Field, InputType, Int, ObjectType } from 'type-graphql'
import { env, Gender, Role } from '../models/env'
import redis, { cache_ex } from '../redis/redis'
export { Gender, Role } from '../models/env'

const qps = pRateLimit({
  interval: 1000,
  rate: 2,
  concurrency: 10
})

export const auth0 = new ManagementClient({
  domain: env.auth0.domain,
  clientId: env.auth0.client_id,
  clientSecret: env.auth0.client_secret
})

export const getUser = async (id: string, cache: boolean = false): Promise<User> => {
  if (cache) {
    const doc = await redis.get(`user:${id}`)
    if (doc) {
      return JSON.parse(doc)
    }
  }
  const user = await qps(() => auth0.getUser({ id }))
  await cacheUser(user)
  return user
}

const cacheUser = async (user: User, pipeline?: any) => {
  if (pipeline) {
    pipeline.set(`user:${user.user_id}`, JSON.stringify(user), 'ex', 86400)
  } else {
    await redis.set(`user:${user.user_id}`, JSON.stringify(user), 'ex', 86400)
  }
}

export const createUser = async (user_data: UpdateUserData) => {
  const user = await qps(() => auth0.createUser({
    ...user_data,
    connection: env.auth0.connection_id
  }))

  console.log(`created user '${user.email}' with '${user.user_id}'`)
  await cacheUser(user)
  return user
}

export const updateUser = async (id: string, data: UpdateUserData) => {
  if (!id.startsWith('auth0')) {
    delete data.given_name
    delete data.family_name
  }
  console.log('updating user', JSON.stringify({ user_id: id, data }))
  const user = await qps(() => auth0.updateUser({ id }, data))
  await cacheUser(user)
  return user
}

export const updateAppMetadata = async (id: string, metadata: AppMetadata) => {
  const user = await qps(() => auth0.updateAppMetadata({ id }, metadata))
  await cacheUser(user)
  return user
}

export const getUsersInRole = async (role: Role) => {
  const roles = await roleID(role)
  return await qps(() => auth0.getUsersInRole({ id: roles[0] }))
}

export const updateUserMetadata = async (id: string, metadata: UserMetadata) => {
  console.log('updating user metadata', JSON.stringify({ user_id: id, metadata }))
  const user = await qps(() => auth0.updateUserMetadata({ id }, metadata))
  await cacheUser(user)
  return user
}

export const deleteUser = async (id: string) => {
  await qps(() => auth0.deleteUser({ id }))
  await redis.del(`user:${id}`)
}

export const getRole = async (id: string): Promise<Role> => {
  const roles = await qps(() => auth0.getUserRoles({ id }))
  return roles.length ? Role[roles[0].name] : undefined
}

export const removeUserByEmail = async (email: string) => {
  const users = await getUsersByEmail(email)
  if (users.length) {
    for (const user of users) {
      await deleteUser(user.user_id)
    }
  }
}

export const getUsersByEmail = async (email: string) => {
  const users = await qps(() => auth0.getUsersByEmail(email))
  return users
}

const roleID = async (role: Role): Promise<string[]> => {
  const all_roles = await cache_ex(`auth0_roles:${env.auth0.domain}`, () => auth0.getRoles())
  return all_roles.filter(ar => ar.name === role).map(ar => ar.id)
}

export const setRole = async (user: User, role: Role) => {
  const id = user.user_id
  const required_roles = await roleID(role)

  const roles = await qps(() => auth0.getUserRoles({ id }))
  if (roles.map(role => role.name).join(' ') !== role) {
    const removing_roles = roles.map(role => role.id)
    if (removing_roles.length) {
      console.log(`removing roles ${removing_roles} from ${id}`)
      await qps(() => auth0.removeRolesFromUser({ id }, { roles: removing_roles }))
    }
    console.log(`assigning role '${role}' to ${id}`)
    await qps(() => auth0.assignRolestoUser({ id }, { roles: required_roles }))
  }
  if (!user.app_metadata || user.app_metadata.role !== role) {
    user.app_metadata = user.app_metadata || {}
    user.app_metadata.role = role
    await updateAppMetadata(id, { role })
  }
}

const auth0_sort = (sort: string) => {
  if (sort && !sort.includes(':')) {
    const mapping = {first_name: 'given_name', last_name: 'family_name'}
    let col = sort.split(/,/)[0]
    let direction = 1
    if (/^-/.test(col)) {
      col = col.substr(1)
      direction = -1
    } else if (/^\+/.test(col)) {
      col = col.substr(1)
    }
    sort = (mapping[col] || col) + ':' + direction
  }
  return sort
}

@ObjectType()
class Auth0UserMetadata implements UserMetadata {
  @Field(type => Gender, { nullable: true })
  gender?: Gender
}
@ObjectType()
class Auth0AppMetadata implements AppMetadata {
  @Field(type => Role, { nullable: true })
  role?: Role
}

@ObjectType()
export class Auth0User implements User<Auth0AppMetadata, Auth0UserMetadata> {
  @Field(type => String)
  email: string

  @Field(type => String, { nullable: true })
  given_name?: string

  @Field(type => String, { nullable: true })
  family_name?: string
  
  @Field(type => Auth0UserMetadata, { nullable: true })
  user_metadata?: Auth0UserMetadata

  @Field(type => Auth0AppMetadata, { nullable: true })
  app_metadata?: Auth0AppMetadata
}

@InputType()
@ArgsType()
class OrSearchOptions {
  @Field(type => [String], { nullable: true })
  email?: string[]

  @Field(type => [String], { nullable: true })
  identity_provider?: string[]
  
  @Field(type => [String], { nullable: true })
  user_id?: string[]
  
  @Field(type => [Int, Int], { nullable: true })
  logins_count?: [number, number]
  
  @Field(type => [Date, Date], { nullable: true })
  last_login?: [Date, Date]
  
  @Field(type => [Role], { nullable: true })
  role?: Role[]
  
  @Field(type => Boolean, { nullable: true })
  blocked?: boolean
  
  @Field(type => Gender, { nullable: true })
  gender?: Gender
}

@ArgsType()
export class SearchOptions extends OrSearchOptions {
  @Field(type => Boolean, { nullable: true })
  email_verified?: boolean
  
  @Field(type => String, { nullable: true })
  term?: string
  
  @Field(type => String, { nullable: true })
  sort?: string
  
  @Field(type => Int, { nullable: true, defaultValue: 50 })
  @Min(1)
  @Max(1000)
  per_page?: number
  
  @Field(type => Int, { nullable: true, defaultValue: 0 })
  page?: number

  @Field(type => OrSearchOptions, { nullable: true })
  or?: OrSearchOptions

  @Field(type => Boolean, { nullable: true })
  debug?: boolean
}

class Query {
  root_and = []
  root_or = []

  private append<T>(to: string[], key: string, value: T) {
    if (typeof value === 'string' && !value.includes('*')) {
      to.push(`${key}:"${value}"`)
    } else {
      to.push(`${key}:${value}`)
    }
  }

  and_where<T>(key: string, value: T[]|T) {
    if (value !== undefined) {
      if (Array.isArray(value)) {
        for (const v of value) {
          this.append(this.root_and, key, v)
        }
      } else {
        this.append(this.root_and, key, value)
      }
    }
  }

  private AND_OR(or: string[]) {
    if (or.length) {
      this.root_and.push(`(${or.join(' OR ')})`)
    }
  }

  or(object: object) {
    const or = []
    for (const key of Object.keys(object)) {
      this.append(or, key, object[key])
    }
    this.AND_OR(or)
  }

  where<T>(key: string, value: T[]|T, op: 'AND'|'OR') {
    const root = op == 'AND' ? this.root_and : this.root_or
    if (value === null) {
      this.where_exist(key, false, op)
    } else if (value !== undefined) {
      if (Array.isArray(value)) {
        const or = []
        for (const v of value) {
          this.append(or, key, v)
        }
        if (or.length) {
          root.push(`(${or.join(' OR ')})`)
        }
      } else {
        this.append(root, key, value)
      }
    }
  }

  where_exist(key: string, value: boolean, op: 'AND'|'OR' = 'AND') {
    const root = op == 'AND' ? this.root_and : this.root_or
    if (value !== undefined) {
      if (value) {
        root.push(`_exists_:${key}`)
      } else {
        root.push(`NOT _exists_:${key}`)
      }
    }
  }

  where_ne<T>(key: string, value: T[]|T, op: 'AND'|'OR' = 'AND') {
    const root = op == 'AND' ? this.root_and : this.root_or
    if (value !== undefined) {
      if (Array.isArray(value)) {
        const and = []
        for (const v of value) {
          this.append(and, `NOT ${key}`, v)
        }
        if (and.length) {
          root.push(`(${and.join(' AND ')})`)
        }
      } else {
        this.append(root, `NOT ${key}`, value)
      }
    }
  }

  range<T>(key: string, value: [T, T], op: 'AND'|'OR' = 'AND') {
    const root = op == 'AND' ? this.root_and : this.root_or
    if (value !== undefined) {
      if (value[0] instanceof Date && value[1] instanceof Date) {
        const d0 = (value[0] as unknown) as Date
        const d1 = (value[1] as unknown) as Date
        root.push(`${key}:[${d0.toISOString()} TO ${d1.toISOString()}]`)
      } else {
        let from: any = value[1]
        if (from === undefined || from === null) {
          from = '*'
        }
        let to: any = value[1]
        if (to === undefined || to === null) {
          to = '*'
        }
        root.push(`${key}:[${from} TO ${to}]`)
      }
    }
  }

  term(term: string) {
    if (term) {
      term = term.replace(/[\\]/g, '')
      const idx = term.lastIndexOf(' ')
      if (idx > -1) {
        const given_name = term.substring(0, idx)
        const family_name = term.substring(idx + 1)
        this.root_and.push(`given_name:"${given_name}"`)
        this.root_and.push(`family_name:"${family_name}"`)
      } else if (term.indexOf('@') > -1) {
        this.root_and.push(`email:"${term}"`)
      } else {
        const or: string[] = []
        if (term.length >= 5) {
          or.push(`given_name:${term}*`)
          or.push(`family_name:${term}*`)
        } else {
          or.push(`given_name:"${term}"`)
          or.push(`family_name:"${term}"`)
        }
        or.push(`email:${term}*`)
        this.AND_OR(or)
      }
    }
  }

  toString() {
    const and = [...this.root_and]
    if (this.root_or.length) {
      and.push(`(${this.root_or.join(' OR ')})`)
    }
    return and.join(' AND ')
  }
}

const queryAddOptions = (query: Query, options: Partial<SearchOptions>, op: 'AND'|'OR') => {
  query.where(`user_id`, options.user_id, op)
  query.where(`blocked`, options.blocked, op)
  query.where(`identities.provider`, options.identity_provider, op)
  query.where(`app_metadata.role`, options.role, op)
  query.where(`email`, options.email, op)
  query.where(`user_metadata.gender`, options.gender, op)
  query.range(`last_login`, options.last_login, op)
  query.range(`logins_count`, options.logins_count, op)
  query.where(`email_verified`, options.email_verified, op)
}

export const buildQuery = (options: SearchOptions) => {
  const query = new Query()
  options.sort = auth0_sort(options.sort)
  queryAddOptions(query, options, 'AND')
  if (options.or) {
    queryAddOptions(query, options.or, 'OR')
  }
  query.term(options.term)
  return query.toString()
}

export const searchUsers = async (options: SearchOptions) => {
  const q = buildQuery(options)
  options.per_page = Math.min(options.per_page || 50, 100)
  options.page = options.page || 0
  if (options.debug) {
    console.log('auth0 getUsers', JSON.stringify({ q, sort: options.sort, page: options.page }))
  }
  const users = await qps(() => auth0.getUsers({
    q,
    sort: options.sort,
    search_engine: 'v3',
    include_totals: true,
    per_page: options.per_page,
    page: options.page
  }))
  const pipeline = redis.pipeline()
  for (const user of users.users) {
    cacheUser(user, pipeline)
  }
  if (pipeline.length) {
    await pipeline.exec()
  }
  return users
}

const FirstLetters = '0123456789abcdefghijklmnopqrstuvwxyz'.split('')
const SecondLetters = '_.-0123456789abcdefghijklmnopqrstuvwxyz'.split('')

export function underAge(user: User|string) {
  let date_of_birth: string
  if (typeof(user) === 'string') {
    date_of_birth = user
  } else {
    if (!user.user_metadata || !user.user_metadata.date_of_birth) {
      return false
    }
    date_of_birth = user.user_metadata.date_of_birth
  }
  return moment(date_of_birth).add(moment.duration(15, 'years')).isAfter(moment())
}

export async function getUsers<T, K extends keyof T & string>(list: T[], key?: K): Promise<User[]> {
  const ret: User[] = []
  if (list.length === 0) {
    return ret
  }

  const docs = await redis.mget(...list.map(item => `user:${key ? item[key]: item}`))
  const batch = 64
  let pipeline: string[] = []
  const execute_batch = async () => {
    if (pipeline.length) {
      const { users } = await searchUsers({ user_id: pipeline, per_page: batch })
      const cache: {[key: string]: User} = {}
      for (const user of users) {
        cache[user.user_id] = user
      }
      for (const user_id of pipeline) {
        ret.push(cache[user_id])
      }
      pipeline = []
    }
  }
  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    const doc = docs[i]
    if (doc) {
      const user = JSON.parse(doc)
      ret.push(user)
    } else {
      try {
        const user_id = String(key ? item[key]: item)
        console.log(`retrieving user (${i + 1}/${list.length}) ${user_id}`)
        pipeline.push(user_id)
        if (pipeline.length >= batch) {
          await execute_batch()
        }
      } catch (error) {
        console.log(`retrieving user ${error.message}`)
      }
    }
  }
  if (pipeline.length) {
    await execute_batch()
  }
  return ret
}

export function searchUsersGenerator(options: Omit<Omit<SearchOptions, 'page'>, 'email'> & { skip_paginate?: boolean }) {
  const per_page = 100
  const initials = [FirstLetters.map(c => c + '*')]
  let current_initial = 0
  let page = 0

  async function usersWithCurrentInitial() {
    const email = initials[current_initial]
    const users = await searchUsers({
      ...options,
      page,
      per_page,
      email
    })
    if (options.debug) {
      console.log(`${email[0]}~${email[email.length - 1]} [${users.start},${users.start + users.users.length}]/${users.total}`)
    }
    return users
  }

  async function next(): Promise<{ done: boolean, value?: UserPage<Auth0AppMetadata, Auth0UserMetadata> }> {
    if (current_initial === initials.length) {
      // last initial
      return { done: true }
    }
    let users: UserPage
    while (true) {
      users = await usersWithCurrentInitial()
      if (page > 0) {
        break
      }
      if (users.total >= 1000) {
        if (initials[current_initial].length === 1) {
          // add second letters
          const prefix = initials[current_initial][0].replace('*', '')
          if (prefix.length === 1) {
            const bucket = SecondLetters.map(c => prefix + c + '*')
            initials[current_initial] = bucket
          } else {
            // more than 2 letters are not supported
            break
          }
        } else {
          const bucket = initials[current_initial]
          initials.splice(current_initial, 1, ...chunk(bucket, Math.floor(bucket.length / 2)))
        }
      } else {
        break
      }
    }
    if (!options.skip_paginate && users.length >= per_page) {
      page += 1
    } else {
      current_initial += 1
      // end of pages
      if (current_initial < initials.length) {
        page = 0
      }
    }
    return { done: false, value: users }
  }
  return {
    [Symbol.asyncIterator]() {
      return { next }
    }
  }
}
