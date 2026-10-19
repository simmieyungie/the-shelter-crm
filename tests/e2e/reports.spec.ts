import { expect, test } from "@playwright/test";
import { login, sql } from "./helpers";

test.describe("service report sign-off", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "Checked on desktop.");
  });

  test("head usher submits, pastor verifies, fields lock, reopen is audited", async ({ browser }) => {
    const [row] = await sql()`select r.id from service_reports r join service_events e on e.id = r.service_event_id
      join service_types t on t.id = e.service_type_id where r.source = 'TALLY' and r.status = 'DRAFT' and t.name = 'Sunday 2nd Service' limit 1`;
    const hu = await (await browser.newContext()).newPage();
    await login(hu, "headusher@example.com");
    await hu.goto(`/reports/${row.id}`);
    await expect(hu.getByText(/Prefilled from 3 usher tallies/)).toBeVisible();
    await hu.getByLabel("Offering").fill("145,000");
    await hu.getByLabel("Tithe").fill("200000.50");
    await expect(hu.getByTestId("collections-total")).toHaveText("₦345,000.50");
    await hu.getByRole("button", { name: "Submit for verification" }).click();
    await expect(hu.getByText("Awaiting pastor").first()).toBeVisible();

    const pastor = await (await browser.newContext()).newPage();
    await login(pastor, "pastor@example.com");
    await pastor.goto(`/reports/${row.id}`);
    pastor.once("dialog", (d) => d.accept());
    await pastor.getByRole("button", { name: "Verify report" }).click();
    await expect(pastor.getByText("Verified").first()).toBeVisible();
    await expect(pastor.getByLabel("Offering")).toHaveAttribute("readonly", "");
    await expect(pastor.getByRole("button", { name: "Submit for verification" })).toHaveCount(0);

    // Secretary cannot reopen; head usher can.
    const sec = await (await browser.newContext()).newPage();
    await login(sec, "secretary@example.com");
    await sec.goto(`/reports/${row.id}`);
    await expect(sec.getByRole("button", { name: "Reopen report" })).toHaveCount(0);

    await hu.reload();
    hu.once("dialog", (d) => d.accept());
    await hu.getByRole("button", { name: "Reopen report" }).click();
    await expect(hu.getByText("Reopened").first()).toBeVisible();
    await hu.getByLabel("Offering").fill("150,000");
    await hu.getByRole("button", { name: "Save draft" }).click();
    await expect(hu.getByText("Draft saved")).toBeVisible();

    const audit = await sql()`select action from audit_log where entity = 'service_report' and entity_id = ${row.id} order by at`;
    expect(audit.map((a) => a.action)).toEqual(["submit", "verify", "reopen", "edit_after_reopen"]);
    const [after] = await sql()`select offering_kobo, status from service_reports where id = ${row.id}`;
    expect(after).toMatchObject({ offering_kobo: "15000000", status: "REOPENED" });
  });
});
