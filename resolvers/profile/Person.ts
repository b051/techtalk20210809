import { User } from 'auth0'
import { GraphQLResolveInfo } from 'graphql'
import { Args, Authorized, Ctx, Field, FieldResolver, Info, Int, ObjectType, Query, Resolver, Root } from 'type-graphql'
import { Person, Role } from '../../models'
import { auth0, Auth0User, getUser, SearchOptions, searchUsersGenerator } from '../../server/auth0'
import { Context } from '../../server/authenticate'

@ObjectType()
class ListPeopleOutput {
  @Field(type => [Auth0User])
  people: Auth0User[]

  @Field(type => Int)
  count: number
}

@Resolver(of => Person)
export class PersonResolver {

  @Query(returns => Person)
  @Authorized()
  async me(@Info() info: GraphQLResolveInfo, @Ctx() ctx: Context) {
    return ctx.person
  }

  @Query(returns => ListPeopleOutput)
  @Authorized(Role.teacher)
  async people(@Args() options: SearchOptions, @Info() info: GraphQLResolveInfo) {
    let count = 0
    const people: Person[] = []
    const appendUsers = async (users: User[]) => {
      users.push()
      const pairs = await Person.findOrCreateFromUsers(users)
      for (const [user, person] of pairs) {
        people.push(person)
      }
    }
    for await (const { users, total } of searchUsersGenerator(options)) {
      count += total
      await appendUsers(users)
    }
    return { people, count }
  }

  @FieldResolver(returns => Auth0User, { nullable: true })
  async auth0_user(@Root() person: Person) {
    return await getUser(person.auth0_user_id)
  }

  @FieldResolver(returns => [Person], { nullable: true })
  async children(@Root() person: Person) {
    if (!person.children) {
      person.children = await person.$get('children')
    }
    return person.children
  }

  @FieldResolver(returns => [String])
  async permissions(@Root() person: Person, @Ctx() ctx: Context) {
    if (ctx.person.id === person.id) {
      return ctx.permissions
    }
    const permissions = await auth0.getUserPermissions({ id: person.auth0_user_id })
    return permissions.map(permission => permission.permission_name) || []
  }

}
