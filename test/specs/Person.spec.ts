import { expect } from 'chai'
import gql from 'graphql-tag'
import { Gender, Role } from '../../models'
import { apollo_server } from '../../server/apollo_server'
import { context, db_init } from './utils'

describe('Person', () => {
  before(db_init)
  
  it('query me', async () => {
    const { errors, data } = await apollo_server.executeOperation({
      query: gql`
      query getMe {
        me {
          auth0_user {
            email
            app_metadata {
              role
            }
            user_metadata {
              gender
            }
          }
        }
      }
      `
    }, {
      ctx: {
        state: await context.for(Role.learner)
      }
    })
    expect(errors, JSON.stringify(errors)).to.be.undefined
    expect(data.me.auth0_user.user_metadata.gender).to.equal(Gender.male)
    expect(data.me.auth0_user.app_metadata.role).to.equal(Role.learner)

  })
})