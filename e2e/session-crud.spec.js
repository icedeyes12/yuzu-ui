import { expect, test } from "@playwright/test";

const STUB = "http://localhost:5000";

test.beforeEach(async ({ page }) => {
	await page
		.context()
		.addCookies([
			{ name: "session", value: "test-session", url: "http://localhost:5173" },
		]);
	// Session CRUD mutates the shared stub state; start each test clean.
	await fetch(`${STUB}/v1/_reset`, { method: "POST" });
});

async function openSidebarWithSessions(page) {
	await page.goto("/chat", { waitUntil: "domcontentloaded" });
	await expect(page.getByText("Hi! I'm Session One.")).toBeVisible();
	await page.click("#hamburgerMenu");
	await expect(page.locator("#mainSidebar.open")).toBeVisible();
	await page.waitForSelector(".sidebar-session-item");
}

test("creates a new session from the sidebar", async ({ page }) => {
	await openSidebarWithSessions(page);

	await page.locator('[data-action="create-session"]').click();

	// The sidebar closes and the new session becomes active via the router.
	await expect(page).toHaveURL(/\/chat\/s3/, { timeout: 10_000 });
	await expect(page.locator("#sessionName")).toHaveText("New Chat");

	// Reopen the sidebar: the new session is listed.
	await page.click("#hamburgerMenu");
	await expect(
		page.locator(".sidebar-session-item", { hasText: "New Chat" }),
	).toHaveCount(1);
});

test("renames a session from the sidebar", async ({ page }) => {
	await openSidebarWithSessions(page);

	page.once("dialog", (dialog) => dialog.accept("Renamed Session"));
	await page
		.locator('.sidebar-session-item:has-text("Session Two") .rename-btn')
		.click();

	await expect(
		page.locator(".sidebar-session-item", { hasText: "Renamed Session" }),
	).toHaveCount(1);
	await expect(
		page.locator(".sidebar-session-item", { hasText: "Session Two" }),
	).toHaveCount(0);
});

test("deletes a session from the sidebar", async ({ page }) => {
	await openSidebarWithSessions(page);

	page.once("dialog", (dialog) => dialog.accept());
	await page
		.locator('.sidebar-session-item:has-text("Session Two") .delete-btn')
		.click();

	await expect(
		page.locator(".sidebar-session-item", { hasText: "Session Two" }),
	).toHaveCount(0);
	// The active session never gets a delete button.
	await expect(
		page.locator('.sidebar-session-item:has-text("Session One") .delete-btn'),
	).toHaveCount(0);
});
