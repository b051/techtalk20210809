import { BelongsTo, Column, ForeignKey, Model, Table } from 'sequelize-typescript'
import { Person } from './Person'

/**
 *  Parent will have same view as teacher but their children will be the only "class" they can view
 * "Same view as teacher" above means for Mark Book only.On the rest of the site parent = learner
 *  two Parents per Child
 */

@Table({
  modelName: 'family',
  tableName: 'families',
  timestamps: false
})
export class Family extends Model {
  @ForeignKey(() => Person)
  @Column
  parent_id: number

  @BelongsTo(() => Person, { onDelete: 'cascade', foreignKey: 'parent_id' })
  parent: Person

  @ForeignKey(() => Person)
  @Column
  child_id: number

  @BelongsTo(() => Person, { onDelete: 'cascade', foreignKey: 'child_id' })
  child: Person
}