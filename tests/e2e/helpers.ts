import { expect, type Page } from "@playwright/test";
import postgres from "postgres";

export const PASSWORD = "password123";

export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Phone number or email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

let sqlClient: ReturnType<typeof postgres> | null = null;
/** Direct database access for test setup and assertions. */
export function sql() {
  sqlClient ??= postgres(process.env.E2E_DATABASE_URL ?? "postgres://crm:crm@localhost:5433/crm_e2e", {
    max: 2,
    onnotice: () => undefined,
  });
  return sqlClient;
}

/** Makes sure a "Special Programme" service exists today for Shelter Parish; returns its event id. */
export async function ensureSpecialServiceToday(): Promise<string> {
  const db = sql();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
  const [type] = await db`select st.id, st.parish_id, st.start_time from service_types st join parishes p on p.id = st.parish_id
    where p.name = 'Shelter Parish' and st.name = 'Special Programme'`;
  await db`insert into service_events (parish_id, service_type_id, event_date, start_time, occurrence)
    values (${type.parish_id}, ${type.id}, ${today}, ${type.start_time}, 1) on conflict do nothing`;
  const [ev] = await db`select id from service_events where service_type_id = ${type.id} and event_date = ${today} and occurrence = 1`;
  return ev.id as string;
}

export async function waitForAllSynced(page: Page) {
  await expect(page.getByTestId("sync-pill").filter({ visible: true })).toHaveText(/All synced/, { timeout: 30_000 });
}

export async function tap(page: Page, label: string, step: 1 | 5, times: number) {
  const button = page.getByRole("button", { name: `Add ${step} to ${label}`, exact: true });
  for (let i = 0; i < times; i++) await button.click();
}

export async function startTally(page: Page, service: string, zone: string) {
  await page.goto("/count");
  await page.getByRole("radio", { name: new RegExp(service) }).click();
  await page.getByRole("radio", { name: new RegExp(zone) }).click();
  await page.getByRole("button", { name: `Start tally · ${zone}` }).click();
  await expect(page.getByRole("heading", { name: zone })).toBeVisible();
}
