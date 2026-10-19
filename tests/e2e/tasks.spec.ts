import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("overdue tasks show a red border and red due text; status chips on phones", async ({ page }, info) => {
  await login(page, "pastor@example.com");
  await page.goto("/tasks");
  await expect(page.getByText(/1 overdue/)).toBeVisible();
  if (info.project.name === "desktop") {
    const card = page.getByTestId("task-board").getByTestId("task-card").filter({ hasText: "Test the gallery microphones" });
    await expect(card).toHaveAttribute("data-overdue", "true");
    await expect(card.getByText(/^Overdue ·/)).toHaveClass(/text-danger-text/);
    // Move it with the card menu.
    await card.getByRole("button", { name: /Actions for/ }).click();
    await page.getByRole("menuitem", { name: "In progress" }).click();
    await expect(page.getByTestId("column-IN_PROGRESS").getByText("Test the gallery microphones")).toBeVisible();
  } else {
    await expect(page.getByRole("tab", { name: /To do · \d/ })).toBeVisible();
    await page.getByRole("tab", { name: /For review/ }).click();
    await expect(page.getByTestId("phone-column").getByText("Print offering envelopes")).toBeVisible();
  }
});
