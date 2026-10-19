import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { loadAccess, type Access } from "@/lib/auth/scope";
import { db } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { getBoard, isOverdue } from "@/lib/db/queries/tasks";
import { moveTask, saveTask } from "@/lib/tasks/mutations";
import { userByEmail } from "../support/db";

let parishId: string;
let technical: string;
let choir: string;
let hod: { id: string; access: Access };

beforeAll(async () => {
  [{ id: parishId }] = await db.select({ id: s.parishes.id }).from(s.parishes).where(eq(s.parishes.name, "Shelter Parish"));
  const depts = await db.select().from(s.departments).where(eq(s.departments.parishId, parishId));
  technical = depts.find((d) => d.name === "Technical")!.id;
  choir = depts.find((d) => d.name === "Choir")!.id;
  const u = await userByEmail("hod@example.com");
  hod = { id: u.id, access: await loadAccess(u.id) };
});

const base = (over: Partial<Parameters<typeof saveTask>[2]> = {}) => ({
  id: null,
  parishId,
  title: "Check cables",
  description: null,
  departmentId: technical,
  serviceEventId: null,
  assignedTo: "",
  priority: "MEDIUM" as const,
  dueAt: new Date(Date.now() + 86_400_000),
  ...over,
});

describe("tasks", () => {
  it("lets an HOD assign within their own department only", async () => {
    const id = await saveTask(hod.access, hod.id, base({ assignedTo: hod.id }));
    expect(id).toBeTruthy();
    // A department member whose only role has ended can't be given work.
    const tech = await userByEmail("tech@example.com");
    await expect(saveTask(hod.access, hod.id, base({ assignedTo: tech.id }))).rejects.toThrow(/isn't in this department/);
    await expect(saveTask(hod.access, hod.id, base({ departmentId: choir, assignedTo: hod.id }))).rejects.toThrow(/own department/);
    const usher = await userByEmail("usher1@example.com");
    await expect(saveTask(hod.access, hod.id, base({ assignedTo: usher.id }))).rejects.toThrow(/isn't in this department/);
  });

  it("lets the pastor assign anyone in the parish", async () => {
    const p = await userByEmail("pastor@example.com");
    const usher = await userByEmail("usher1@example.com");
    await expect(saveTask(await loadAccess(p.id), p.id, base({ departmentId: choir, assignedTo: usher.id }))).resolves.toBeTruthy();
  });

  it("computes overdue rather than storing it", async () => {
    const board = await getBoard(hod.access, hod.id, parishId, {});
    const mic = board.find((t) => t.title === "Test the gallery microphones")!;
    expect(mic.overdue).toBe(true);
    expect(isOverdue({ status: "DONE", dueAt: new Date(0) })).toBe(false);
    await moveTask(hod.access, hod.id, mic.id, "DONE");
    const after = await getBoard(hod.access, hod.id, parishId, {});
    expect(after.find((t) => t.id === mic.id)?.overdue).toBe(false);
    const [row] = await db.select().from(s.tasks).where(eq(s.tasks.id, mic.id));
    expect(row.completedAt).not.toBeNull();
  });

  it("stops other people moving tasks that aren't theirs", async () => {
    const usher = await userByEmail("usher2@example.com");
    const [t] = await db.select().from(s.tasks).where(and(eq(s.tasks.parishId, parishId), eq(s.tasks.title, "Set up livestream camera")));
    await expect(moveTask(await loadAccess(usher.id), usher.id, t.id, "DONE")).rejects.toThrow();
  });

  it("shows ushers only their own tasks", async () => {
    const usher = await userByEmail("usher1@example.com");
    const board = await getBoard(await loadAccess(usher.id), usher.id, parishId, {});
    expect(board.every((t) => t.assignedTo === usher.id || t.canManage)).toBe(true);
    expect(board.some((t) => t.title === "Brief new ushers on zone counting")).toBe(true);
  });
});
