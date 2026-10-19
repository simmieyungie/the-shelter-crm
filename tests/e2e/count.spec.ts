import { expect, test } from "@playwright/test";
import { ensureSpecialServiceToday, login, sql, startTally, tap, waitForAllSynced } from "./helpers";

test.describe("headcount", () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "mobile", "Ushers count on phones.");
  });

  test("two ushers tallying the same zone sum correctly in the report", async ({ browser }) => {
    const eventId = await ensureSpecialServiceToday();
    const zone = "Gallery – Left";

    const a = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const b = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pa = await a.newPage();
    const pb = await b.newPage();
    await login(pa, "usher1@example.com");
    await login(pb, "usher2@example.com");
    await startTally(pa, "Special Programme", zone);
    await startTally(pb, "Special Programme", zone);

    await tap(pa, "Men", 5, 2); // 10
    await tap(pa, "Women", 1, 7); // 7
    await tap(pa, "Children", 1, 3); // 3
    await tap(pb, "Men", 1, 4); // 4
    await tap(pb, "Women", 5, 3); // 15
    await tap(pb, "First-timers", 1, 2);
    await expect(pa.getByTestId("your-count")).toHaveText("20");
    await expect(pb.getByTestId("your-count")).toHaveText("19");
    await waitForAllSynced(pa);
    await waitForAllSynced(pb);

    const [report] = await sql()`select men, women, children, first_timers, source, status from service_reports where service_event_id = ${eventId}`;
    expect(report).toMatchObject({ men: 14, women: 22, children: 3, first_timers: 2, source: "TALLY", status: "DRAFT" });

    // Zone so far = mine + the other usher's.
    await pa.reload();
    await expect(pa.getByTestId("zone-so-far")).toHaveText("39", { timeout: 20_000 });
    await a.close();
    await b.close();
  });

  test("offline: tally, register a first-timer, reload, then sync exactly once", async ({ page, context }) => {
    const eventId = await ensureSpecialServiceToday();
    const zone = "Children's Church";
    await login(page, "headusher@example.com");
    await page.goto("/count");
    // Let the service worker install and take control, then load Count through it.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await startTally(page, "Special Programme", zone);
    await page.reload(); // cache this exact page while online
    await expect(page.getByRole("heading", { name: zone })).toBeVisible();

    const before = await sql()`select count(*)::int as n from members`;

    await context.setOffline(true);
    await tap(page, "Men", 1, 8);
    await tap(page, "Women", 1, 9);
    await tap(page, "Children", 1, 2);
    await tap(page, "First-timers", 1, 1); // 20 taps
    await expect(page.getByTestId("your-count")).toHaveText("19");
    await expect(page.getByTestId("sync-pill").filter({ visible: true })).toHaveText(/Offline · \d+ waiting/);

    await page.getByRole("button", { name: /Register first-timer details · 1 to go/ }).click();
    await page.getByLabel(/Full name/).fill("Offline Guest");
    await page.getByLabel(/^Phone/).fill("0809 555 0101");
    await page.getByRole("button", { name: "Save & finish" }).click();
    await expect(page.getByRole("heading", { name: zone })).toBeVisible();

    await page.reload(); // offline reload: served by the service worker, data from IndexedDB
    await expect(page.getByTestId("your-count")).toHaveText("19");
    await expect(page.getByTestId("counter-first-timers").getByRole("status")).toHaveText("1").catch(() => undefined);

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await waitForAllSynced(page);

    const [userRow] = await sql()`select id from users where email = 'headusher@example.com'`;
    const [tally] = await sql()`select men, women, children, first_timers, client_id, sanctuary_zone_id from zone_tallies
      where service_event_id = ${eventId} and user_id = ${userRow.id}`;
    expect(tally).toMatchObject({ men: 8, women: 9, children: 2, first_timers: 1 });
    const guests = await sql()`select id, status, first_visit_on, client_id from members where first_name = 'Offline' and last_name = 'Guest'`;
    expect(guests).toHaveLength(1);
    expect(guests[0].status).toBe("FIRST_TIMER");
    const checkins = await sql()`select 1 from attendance_checkins where member_id = ${guests[0].id} and service_event_id = ${eventId}`;
    expect(checkins).toHaveLength(1);

    // Re-sending the same batch must not create duplicates.
    const resend = await page.evaluate(
      async ({ eventId, zoneId, tallyClientId, memberClientId }) => {
        const res = await fetch("/api/v1/sync", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            items: [
              { clientId: tallyClientId, kind: "tally.upsert", payload: { serviceEventId: eventId, sanctuaryZoneId: zoneId, men: 8, women: 9, children: 2, firstTimers: 1, clientUpdatedAt: "2020-01-01T00:00:00.000Z" } },
              { clientId: memberClientId, kind: "member.create", payload: { serviceEventId: eventId, firstName: "Offline", lastName: "Guest", phone: "08095550101", consentContact: true } },
            ],
          }),
        });
        return res.json();
      },
      { eventId, zoneId: tally.sanctuary_zone_id, tallyClientId: tally.client_id, memberClientId: guests[0].client_id },
    );
    expect(resend.results.map((r: { status: string }) => r.status)).toEqual(["duplicate", "duplicate"]);
    const after = await sql()`select count(*)::int as n from members`;
    expect(after[0].n).toBe(before[0].n + 1);
    const [again] = await sql()`select men, women, children, first_timers from zone_tallies where service_event_id = ${eventId} and user_id = ${userRow.id}`;
    expect(again).toMatchObject({ men: 8, women: 9, children: 2, first_timers: 1 });
  });
});
