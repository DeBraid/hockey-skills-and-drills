import { getPool } from "./db.js"
import { isUuid } from "./plans.js"

export const DELETE_CONFIRM = "delete my account"

export async function deleteUserAccount(userId: string): Promise<boolean> {
  if (!isUuid(userId)) return false
  const client = await getPool().connect()
  try {
    await client.query("BEGIN")
    const found = await client.query(`SELECT email FROM users WHERE id = $1`, [userId])
    const email = found.rows[0]?.email
    if (!found.rows[0]) {
      await client.query("ROLLBACK")
      return false
    }
    if (typeof email === "string" && email) {
      await client.query(`DELETE FROM verification_token WHERE identifier = $1`, [email])
    }
    await client.query(`DELETE FROM users WHERE id = $1`, [userId])
    await client.query("COMMIT")
    return true
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}
