import 'reflect-metadata'
import { ApolloServer } from 'apollo-server-koa'
import * as fs from 'fs'
import { AuthChecker, buildSchemaSync } from 'type-graphql'
import { DateScalar } from './DateScalar'
import { context, Context } from './authenticate'
import { bugsnag, translateSequelizeError } from './logger'
import { Role } from '../models'

export const apollo_server = (() => {
  const resolvers: [string, ...string[]] = ['']
  resolvers.splice(0)
  const ext = __filename.substring(__filename.lastIndexOf('.'))
  const resolvers_dir = `${__dirname}/../resolvers`
  for (const folder of fs.readdirSync(resolvers_dir)) {
    const _folder = `${resolvers_dir}/${folder}`
    if (fs.statSync(_folder).isDirectory()) {
      for (const file of fs.readdirSync(_folder)) {
        if (file.endsWith(ext)) {
          resolvers.push(`${_folder}/${file}`)
        }
      }
    }
  }
  const authChecker: AuthChecker<Context, Role> = async ({ root, args, context, info }, roles) => {
    if (!context.permissions) return false
    if (!roles || !roles.length) {
      roles = [Role.learner]
    }
    for (const role of roles) {
      if (context.permissions.includes(`role:${role}`)) {
        return true
      }
    }
    return false
  }

  const schema = buildSchemaSync({
    resolvers,
    authChecker,
    scalarsMap: [{ type: Date, scalar: DateScalar }]
  })

  return new ApolloServer({
    schema,
    subscriptions: false,
    introspection: true,
    playground: true,
    context: async ({ ctx }) => {
      if (ctx.request?.body?.operationName === 'IntrospectionQuery') {
        return {}
      }
      return await context(ctx)
    },
    formatError: (error) => {
      if (error.message && error.message.startsWith('Context creation failed: ')) {
        return {
          statusCode: 401,
          locations: error.locations,
          message: error.message.substr('Context creation failed: '.length),
          extensions: error.extensions
        }
      }
      if (error.message && error.message.startsWith('Access denied!')) {
        return {
          statusCode: 401,
          locations: error.locations,
          message: error.message.substr('Access denied!'.length).trim(),
          extensions: error.extensions
        }
      }
      let bugsnagError: Error = error
      if ('exception' in error.extensions) {
        if (error.extensions.exception.name === 'SequelizeDatabaseError') {
          console.log(error.extensions.exception.original)
        } else {
          console.error(error.extensions.exception.stacktrace)
        }
        const boom = translateSequelizeError(error.extensions.exception)
        if (boom && boom.output) {
          return boom.output.payload
        }
      } else if (error.extensions.code === 'INTERNAL_SERVER_ERROR') {
        console.log(error.originalError)
        bugsnagError = error.originalError
      } else {
        console.log(error)
      }
      if (bugsnag) {
        bugsnag.notify(bugsnagError, event => {
          event.addMetadata('extensions', error.extensions)
          if (error.source) {
            event.addMetadata('source', error.source)
          }
        })
      }
      return error
    }
  })
})()