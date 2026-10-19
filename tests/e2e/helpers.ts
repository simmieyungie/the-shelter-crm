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
