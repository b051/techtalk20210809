import * as Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL)

export default redis

export const dedup = <T>(items: T[]): T[] => Array.from(new Set(items))

const __lift_states = {}

export const time = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
  const start = process.hrtime()
  const value = await fn()
  const diff = process.hrtime(start)
  const duration = diff[0] * 1e3 + diff[1] * 1e-6
  console.debug({ [label]: duration })
  return value
}

export const lift = async <T>(key: string, exec: (() => Promise<T>)): Promise<T> => {
  let future = __lift_states[key]

  if (!future) {
    const timer = setTimeout(() => {
      delete __lift_states[key]
    }, 10000)
    __lift_states[key] = future = new Promise(async (resolve) => {
      const value = await exec()
      clearTimeout(timer)
      delete __lift_states[key]
      resolve(value)
    })
  }
  return await future
}

export const cache_ex = async <T>(key: string, func: () => Promise<T>, expires: number = 3600): Promise<T> => {
  let doc = await redis.get(key)
  let ret: T
  if (!doc) {
    ret = await func()
    await redis.set(key, JSON.stringify(ret), 'ex', expires)
  } else {
    ret = JSON.parse(doc)
  }
  return ret
}

export const lift_cache_ex = async <T>(key: string, func: () => Promise<T>, expires: number = 3600): Promise<T> => {
  let future = __lift_states[key]
  if (!future) {
    __lift_states[key] = future = new Promise(async (resolve, reject) => {
      const doc = await redis.get(key)
      let ret: T
      if (!doc) {
        ret = await func()
        redis.set(key, JSON.stringify(ret), 'ex', expires)
      } else {
        ret = JSON.parse(doc)
      }
      delete __lift_states[key]
      resolve(ret)
    })
  }
  return await future
}

export const scan = (match: string, fn: (keys: string[]) => void): Promise<void> => {
  return new Promise((resolve, reject) => {
    const stream = redis.scanStream({ match, count: 100 })
    const futures = []
    stream.on('data', (chunk) => {
      futures.push(fn(chunk))
    })
    stream.on('end', async () => {
      await Promise.all(futures)
      resolve()
    })
  })
}

export const deleteAll = async (prefix: string) => {
  const db = redis.pipeline()
  await scan(prefix, keys => {
    if (keys.length) {
      db.del(...keys)
    }
  })
  await db.exec()
}
