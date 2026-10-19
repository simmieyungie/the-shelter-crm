import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function userByEmail(email: string) {
  const [u] = await db.select().from(users).where(eq(users.email, email));
  if (!u) throw new Error(`No seeded user ${email}`);
  return u;
}
