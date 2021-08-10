import type { User } from 'auth0'
import { AutoIncrement, BelongsToMany, Column, DataType, HasMany, Model, PrimaryKey, Table } from 'sequelize-typescript'
import { Field, ID, ObjectType } from 'type-graphql'
import { Family } from './Family'

@Table({
  modelName: 'person',
  tableName: 'people',
  timestamps: false
})
@ObjectType()
export class Person extends Model {
  @AutoIncrement
  @PrimaryKey
  @Column
  @Field(type => ID)
  id: number

  @Column({
    type: DataType.CHAR(50).BINARY,
    unique: true
  })
  @Field(type => String)
  auth0_user_id: string

  @BelongsToMany(() => Person, () => Family, 'parent_id', 'child_id')
  children: Person[]

  @HasMany(() => Family, 'child_id')
  as_child_in_family: Family[]

  @BelongsToMany(() => Person, () => Family, 'child_id', 'parent_id')
  parents: Person[]

  @HasMany(() => Family, 'parent_id')
  as_parent_in_family: Family[]

  static async findOrCreateFromUsers(users: User[]): Promise<[User, Person][]> {
    const auth0_user_ids: string[] = []
    for (const user of users) {
      for (const id of user.identities) {
        auth0_user_ids.push(`${id.provider}|${id.user_id}`)
      }
    }
    const people = await this.findAll({ where: { auth0_user_id: auth0_user_ids } })
    const mapping: { [key: string]: Person } = {}
    for (const person of people) {
      mapping[person.auth0_user_id] = person
    }
    for (const user of users) {
      const auth0_user_id = user.user_id
      let person = mapping[auth0_user_id]
      if (!person) {
        person = await Person.create({ auth0_user_id })
        mapping[auth0_user_id] = person
      } else {
        await person.update({ auth0_user_id })
      }
    }
    return users.map(user => [user, mapping[user.user_id]])
  }

  static async findOrCreateFromUser(user: User, scope: string[] = []) {
    const possible_ids = user.identities.map(id => `${id.provider}|${id.user_id}`)
    let person = await this.scope(scope).findOne({ where: { auth0_user_id: possible_ids } })
    const auth0_user_id = user.user_id
    if (!person) {
      person = await Person.create({ auth0_user_id })
    } else {
      await person.update({ auth0_user_id })
    }
    return person
  }

}
