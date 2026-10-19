import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("app shell", () => {
  test("login works and the layout fits the viewport", async ({ page }, info) => {
    await login(page, "headusher@example.com");
    await expect(page.getByTestId("sync-pill").filter({ visible: true })).toBeVisible();

    if (info.project.name === "desktop") {
      await expect(page.getByTestId("side-nav")).toBeVisible();
      await expect(page.getByTestId("bottom-tabs")).toBeHidden();
      await expect(page.getByTestId("parish-name")).toHaveText("Shelter Parish");
    } else {
      await expect(page.getByTestId("bottom-tabs")).toBeVisible();
      await expect(page.getByTestId("side-nav")).toBeHidden();
      const tabs = page.getByTestId("bottom-tabs").getByRole("link");
      await expect(tabs).toHaveText(["Count", "Tasks", "Reports", "Members"]);
    }
    // No horizontal page scroll.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await expect(page).toHaveScreenshot(`shell-${info.project.name}.png`, {
      mask: [page.locator("main")],
      fullPage: false,
    });
  });

  test("navigation is filtered by role", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "Checked once on desktop.");
    await login(page, "usher1@example.com");
    await expect(page.getByTestId("side-nav").getByRole("link")).toHaveText(["Count", "Tasks"]);
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await login(page, "zonalpastor@example.com");
    await expect(page).toHaveURL(/\/zone/);
    await expect(page.getByTestId("side-nav").getByRole("link")).toHaveText(["Zone"]);
  });
});
