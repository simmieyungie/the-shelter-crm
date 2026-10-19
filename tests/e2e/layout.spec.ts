import { expect, test } from "@playwright/test";
import { login } from "./helpers";

const PAGES: Record<string, string[]> = {
  "headusher@example.com": ["/count", "/count/roster", "/tasks", "/reports", "/reports/new", "/reports/import", "/members"],
  "pastor@example.com": ["/admin", "/admin/parish", "/admin/parish?tab=services", "/admin/users"],
  "zonalpastor@example.com": ["/zone", "/zone?period=quarter", "/admin/remittance"],
  "admin@example.com": ["/admin/hierarchy"],
};

test.describe("every page works at 360px with no horizontal page scroll", () => {
  test.use({ viewport: { width: 360, height: 780 } });
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "mobile", "Phone layout only.");
  });

  for (const [email, paths] of Object.entries(PAGES)) {
    test(email, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await login(page, email);
      for (const p of paths) {
        const res = await page.goto(p);
        expect(res?.status(), p).toBeLessThan(400);
        await expect(page.locator("main h1, main [role=radiogroup]").first()).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${p} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
        // Inputs are at least 16px so iOS doesn't zoom.
        const small = await page.evaluate(() =>
          [...document.querySelectorAll("main input:not([type=checkbox]):not([type=radio]):not([type=hidden]), main select, main textarea")]
            .filter((el) => (el as HTMLElement).offsetParent !== null)
            .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16).length,
        );
        expect(small, `${p} has inputs under 16px`).toBe(0);
      }
      expect(errors).toEqual([]);
    });
  }
});
