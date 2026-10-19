/* Creates (or resets) a system administrator. Usage:
 *   pnpm exec tsx --conditions=react-server scripts/create-admin.ts "Full Name" email@example.org 08031234567 'a-strong-password'
 */
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const [name, email, phone, password] = process.argv.slice(2);
  if (!name || !email || !password || password.length < 10) {
    console.error('Usage: create-admin.ts "Full Name" email phone password(min 10 chars)');
    process.exit(1);
  }
  const { eq } = await import("drizzle-orm");
  const { db, closeDb } = await import("../lib/db");
  const s = await import("../lib/db/schema");
  const { hashPassword } = await import("../lib/auth/password");
  const { normalisePhone } = await import("../lib/phone");
  const passwordHash = await hashPassword(password);
  const values = { name, email: email.toLowerCase(), phone: phone ? normalisePhone(phone) : null, passwordHash, isActive: true };
  const [existing] = await db.select().from(s.users).where(eq(s.users.email, values.email));
  const user = existing
    ? (await db.update(s.users).set(values).where(eq(s.users.id, existing.id)).returning())[0]
    : (await db.insert(s.users).values(values).returning())[0];
  const { and } = await import("drizzle-orm");
  const [hasRole] = await db.select().from(s.roleAssignments).where(and(eq(s.roleAssignments.userId, user.id), eq(s.roleAssignments.role, "SYSTEM_ADMIN")));
  if (!hasRole) await db.insert(s.roleAssignments).values({ userId: user.id, role: "SYSTEM_ADMIN", scopeLevel: "GLOBAL", scopeId: null });
  console.log(`System admin ready: ${user.email}`);
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
