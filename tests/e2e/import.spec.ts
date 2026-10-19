import { expect, test } from "@playwright/test";
import { login, sql } from "./helpers";

test.describe("spreadsheet import wizard", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "Checked on desktop.");
  });

  test("upload, match, review, import and undo", async ({ page }) => {
    await login(page, "secretary@example.com");
    await page.goto("/reports/import");
    await page.getByLabel("Spreadsheet file").setInputFiles("tests/fixtures/imports/messy-register.xlsx");
    // Two sheets: pick the register.
    await page.getByRole("radio", { name: /2026/ }).check();
    await page.getByRole("button", { name: "Use this sheet" }).click();

    await expect(page.getByRole("heading", { name: "Match your columns" })).toBeVisible();
    await expect(page.getByLabel("Field for Male")).toHaveValue("men");
    await expect(page.getByLabel("Field for Kids")).toHaveValue("children");
    await expect(page.getByLabel("Field for S/N")).toHaveValue("skip");
    await page.getByRole("button", { name: "Continue to review" }).click();

    await expect(page.getByTestId("count-fix")).not.toContainText(/^Need a fix0/);
    await expect(page.getByText(/Services we don.t recognise/)).toBeVisible();
    await page.getByLabel('Service for Youth Service').selectOption({ label: "Special Programme" });
    await expect(page.getByText(/Services we don.t recognise/)).toBeHidden();

    // Resolve every remaining row: choose the first offered fix.
    for (let i = 0; i < 15; i++) {
      const fix = page.getByTestId("count-fix");
      const before = (await fix.textContent()) ?? "";
      if (before.includes("All sorted")) break;
      const select = page.locator("section select:has(option[value=''])").first();
      const options = await select.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
      const choice = options.find((o) => o !== "skip") ?? "skip";
      await select.selectOption(choice);
      await expect(fix).not.toHaveText(before, { timeout: 15_000 });
    }
    await expect(page.getByTestId("count-fix")).toContainText("All sorted");
    const readyText = await page.getByTestId("count-ready").innerText();
    const ready = Number(readyText.match(/\d+/)![0]);
    await page.getByRole("button", { name: `Import ${ready} services` }).click();

    await expect(page.getByTestId("import-result")).toContainText(`${ready} services imported · Sun 1 Mar 2026`);
    const [batch] = await sql()`select id from import_batches where status = 'COMMITTED' order by created_at desc limit 1`;
    const imported = await sql()`select status, source from service_reports where import_batch_id = ${batch.id}`;
    expect(imported).toHaveLength(ready);
    expect(new Set(imported.map((r) => r.status))).toEqual(new Set(["SUBMITTED"]));

    await page.goto("/reports?from=2026-03-01&to=2026-03-31");
    await expect(page.getByText("Imported · check").first()).toBeVisible();

    await page.goto(`/reports/import/${batch.id}`);
    await page.getByRole("button", { name: "Undo this import" }).click();
    await page.getByRole("button", { name: "Yes, undo this import" }).click();
    await expect(page.getByText("This import was undone.")).toBeVisible();
    expect(await sql()`select 1 from service_reports where import_batch_id = ${batch.id}`).toHaveLength(0);
  });
});
