import { expect } from 'chai'
import { QueryTypes } from 'sequelize'
import * as uuid from 'uuid'
import { getUser, Role } from '../../server/auth0'
import { Context } from '../../server/authenticate'
import { db, Person } from '../../models'


export const db_init = async () => {
  const tables = await db.query<{ table_name: string }>(`SELECT
  table_name
  FROM
  information_schema.tables
  WHERE
  table_schema = 'techtalk_test'`, { type: QueryTypes.SELECT })
  await db.query(`SET FOREIGN_KEY_CHECKS = 0;`)
  for (const table of tables) {
    await db.query(`DROP TABLE IF EXISTS ${table.table_name};`)
  }
  await db.query(`SET FOREIGN_KEY_CHECKS = 1;`)
  await db.sync({ force: true })
}

export const auth0_user_ids = new Map<Role, string>([
  [Role.admin, 'auth0|6112326ae16b91006ad66624'],
  [Role.learner, 'auth0|611232cc8e31d50069f899e0'],
  [Role.teacher, 'auth0|61123309c61fd70077d2be3e'],
  [Role.editor, 'auth0|6112333d2454f2006a26775a']
])

const permissions = new Map<Role, string[]>([
  [Role.learner,  ['role:learner']],
  [Role.teacher,  ['role:learner', 'role:teacher']],
  [Role.editor,   ['role:learner', 'role:teacher', 'role:editor']],
  [Role.admin,    ['role:learner', 'role:teacher', 'role:editor', 'role:admin']]
])

export const context = {
  async for(role: Role): Promise<Context> {
    const user = await getUser(auth0_user_ids.get(role), true)
    const person = await Person.findOrCreateFromUser(user)
    return {
      user, person, permissions: permissions.get(role), uuid: uuid.v4()
    }
  }
}

export const sleep = (timeout: number) => {
  return new Promise((resolve) => setTimeout(resolve, timeout));
}

export const expect_true = async (fn: () => boolean, max_ms: number = 2_000) => {
  const interval = 10
  const max_times = Math.ceil(max_ms / interval)
  let time = 0
  while (time++ < max_times) {
    if (fn()) {
      expect(true).to.be.true
      return
    }
    await sleep(interval)
  }
  expect(false).to.be.true
}