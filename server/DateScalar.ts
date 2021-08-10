import { GraphQLScalarType, Kind } from 'graphql'
import * as moment from 'moment'

const timezoneSuffix = /([+-][01]\d:?[03]0|Z)$/

const moment_tz = (value?: moment.MomentInput) => {
  if (typeof value === 'string' && timezoneSuffix.test(value)) {
    return moment.utc(value, true)
  }
  return moment.utc(value).utcOffset(8, true)
}

export const DateScalar = new GraphQLScalarType({
  name: "Date",
  description: "Date.js",
  parseValue(value: string) {
    return moment_tz(value).toDate()
  },
  serialize(value: Date) {
    if (typeof(value) === 'string') {
      return value
    } else if (typeof(value) === 'number') {
      if (value < 31536000000) {
        return moment(value * 1000).toISOString()
      } else {
        return moment(value).toISOString()
      }
    }
    return value.toISOString()
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return moment_tz(ast.value).toDate()
    } else if (ast.kind === Kind.INT) {
      return new Date(Number(ast.value))
    }
    return null
  }
})
