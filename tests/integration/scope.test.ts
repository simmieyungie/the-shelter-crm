import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { can, canManageDepartmentTasks } from "@/lib/auth/permissions";
import { getAccessibleParishIds, loadAccess } from "@/lib/auth/scope";
import { db } from "@/lib/db";
import { areas, departments, parishes } from "@/lib/db/schema";
import { userByEmail } from "../support/db";

async function parishNamesFor(email: string) {
  const user = await userByEmail(email);
  const ids = await getAccessibleParishIds(user);
  if (ids.length === 0) return [];
  const rows = await db.select({ name: parishes.name }).from(parishes).where(inArray(parishes.id, ids));
  return rows.map((r) => r.name).sort();
}

async function parishesInArea(name: string) {
  const rows = await db
    .select({ name: parishes.name })
    .from(parishes)
    .innerJoin(areas, eq(areas.id, parishes.areaId))
    .where(eq(areas.name, name));
  return rows.map((r) => r.name).sort();
}

describe("getAccessibleParishIds", () => {
  it("gives a parish-level user only their parish", async () => {
    for (const email of ["usher1@example.com", "headusher@example.com", "secretary@example.com", "hod@example.com", "tribe@example.com", "pastor@example.com"]) {
      expect(await parishNamesFor(email), email).toEqual(["Shelter Parish"]);
    }
  });

  it("stops a PARISH_PASTOR reading another parish", async () => {
    expect(await parishNamesFor("pastor2@example.com")).toEqual(["Grace Assembly"]);
    expect(await parishNamesFor("pastor@example.com")).not.toContain("Grace Assembly");
  });

  it("gives an AREA_PASTOR of Area 1 only Area 1's parishes, never Area 2's", async () => {
    const mine = await parishNamesFor("areapastor@example.com");
    expect(mine).toEqual(await parishesInArea("Ikeja Area"));
    for (const other of await parishesInArea("Ogba Area")) expect(mine).not.toContain(other);
  });

  it("gives an AREA_PASTOR of Area 2 only Area 2", async () => {
    expect(await parishNamesFor("areapastor2@example.com")).toEqual(await parishesInArea("Ogba Area"));
  });

  it("gives a ZONAL_PASTOR every parish in the zone's areas", async () => {
    expect(await parishNamesFor("zonalpastor@example.com")).toHaveLength(6);
  });

  it("gives PROVINCIAL_ADMIN and SYSTEM_ADMIN their whole scope", async () => {
    expect(await parishNamesFor("provadmin@example.com")).toHaveLength(6);
    expect(await parishNamesFor("admin@example.com")).toHaveLength(6);
  });

  it("ignores expired role assignments", async () => {
    expect(await parishNamesFor("tech@example.com")).toEqual([]);
  });
});

describe("permission matrix", () => {
  it("lets ushers tally but not verify; lets the pastor verify but not tally", async () => {
    const usher = await loadAccess((await userByEmail("usher1@example.com")).id);
    const pastor = await loadAccess((await userByEmail("pastor@example.com")).id);
    const [p1] = usher.parishIds;
    expect(can(usher, "submitTally", p1)).toBe(true);
    expect(can(usher, "verifyReport", p1)).toBe(false);
    expect(can(pastor, "verifyReport", p1)).toBe(true);
    expect(can(pastor, "submitTally", p1)).toBe(false);
  });

  it("does not give oversight roles parish powers", async () => {
    const zonal = await loadAccess((await userByEmail("zonalpastor@example.com")).id);
    for (const p of zonal.parishIds) {
      expect(can(zonal, "verifyReport", p)).toBe(false);
      expect(can(zonal, "zoneOverview", p)).toBe(true);
    }
  });

  it("limits an HOD to their own department", async () => {
    const hod = await loadAccess((await userByEmail("hod@example.com")).id);
    const [p1] = hod.parishIds;
    const depts = await db.select().from(departments).where(eq(departments.parishId, p1));
    const technical = depts.find((d) => d.name === "Technical")!;
    const choir = depts.find((d) => d.name === "Choir")!;
    expect(canManageDepartmentTasks(hod, p1, technical.id)).toBe(true);
    expect(canManageDepartmentTasks(hod, p1, choir.id)).toBe(false);
  });
});
