import { expect, test } from "@playwright/test";

test("serves the Trip Studio workspace", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /trip studio/i })).toBeVisible();
  await expect(page.getByText(/traveler brief/i)).toBeVisible();
});
