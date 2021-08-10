import * as Boom from '@hapi/boom'
import * as Koa from 'koa'
import _bugsnag, { Client } from '@bugsnag/js'
import { stage } from '../models'

export let bugsnag: Client
if (process.env.BUGSNAG_API_KEY) {
  bugsnag = _bugsnag.start({
    apiKey: process.env.BUGSNAG_API_KEY,
    appType: 'web_server',
    releaseStage: stage
  })
}

const isTest = process.env.NODE_ENV === 'test'

const serializers = {
  ctx: (ctx: any) => {
    if (!ctx.header) {
      return ctx
    }
    const json: any = {
      method: ctx.method,
      path: ctx.path,
      body: redact(Object.assign({}, ctx.request.body)),
      status: ctx.status
    }
    if (ctx.status >= 400) {
      json.response = ctx.response.body
    }
    const person = ctx.state && ctx.state.person
    if (person) {
      json.person = person.id
    }
    return json
  }
}

const redact = (payload: { [key: string]: any }) => {
  if (payload.password) {
    payload.password = '[redacted]'
  }
  if (payload.old_password) {
    payload.old_password = '[redacted]'
  }
  return payload
}

const sendError = (ctx: Koa.Context, error: Error) => {
  if (!isTest && bugsnag) {
    bugsnag.notify(error, event => {
      event.addMetadata('ctx', serializers.ctx(ctx))
    })
  }
  console.error(error.stack, serializers.ctx(ctx))
}

export const translateSequelizeError = (error: any) => {
  let boom
  if (error.isBoom) {
    return error
  }
  if (error.errors) {
    const err = error.errors[0]
    if (error.name === 'SequelizeValidationError') {
      boom = Boom.expectationFailed(err.message, err)
    } else if (error.name === 'SequelizeUniqueConstraintError') {
      boom = Boom.conflict(err ? err.message : error.parent.sql, error)
    } else {
      boom = Boom.badData(err.message, err)
    }
  }
  return boom
}

const boom = async (ctx: Koa.Context, next: Function) => {
  try {
    await next()
    if (ctx.path === '/graphql') {
      if (ctx.status === 500) {
        let body: any = ctx.response.body
        if (typeof body === 'string') {
          body = JSON.parse(body)
        }
        if ('errors' in body && Array.isArray(body.errors)) {
          for (const error of body.errors) {
            if (typeof error === 'object' && 'statusCode' in error) {
              ctx.status = 200
              break
            }
          }
        }
      }
    }
  } catch (error) {
    let boom = translateSequelizeError(error)
    if (boom) {
      ctx.status = boom.output.statusCode
      ctx.body = boom.output.payload
      ctx._boom = boom
    }
    if (ctx.status >= 500) {
      sendError(ctx, error)
    }
  }
}

export const logger = (): Koa.Middleware => {
  return async (ctx: any, next) => {
    await boom(ctx, next)
    if (isTest) return
    if (ctx.method === 'POST' && ctx.request.body?.operationName === 'IntrospectionQuery') return
  }
}
