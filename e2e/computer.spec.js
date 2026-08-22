import { expect, test } from "@playwright/test";

const STUB = "http://localhost:5000";

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
	for (const url of ["http://localhost:5173", STUB]) {
		await page.context().addCookies([
			{ name: "session", value: "test-session", url },
			{ name: "yuzu_session", value: "test-session", url },
		]);
	}
	await page.route("**/v1/auth/me", (route) =>
		route.fulfill({
			json: { status: "success", user_id: "user-123", user_name: "Tester" },
		}),
	);
	await page.route("**/v1/sandbox/status", (route) =>
		route.fulfill({ json: { has_sandbox: false, state: "none" } }),
	);
	await page.route("**/v1/sessions/list", (route) =>
		route.fulfill({ json: { status: "success", sessions: [] } }),
	);
});

test("My Computer hamburger opens once and Chat navigation works", async ({
	page,
}) => {
	await page.goto("/computer", { waitUntil: "domcontentloaded" });
	await page.waitForSelector("#mainSidebar");

	await page.click("#hamburgerMenu");
	await expect(page.locator("#mainSidebar")).toHaveClass(/open/);
	await expect(page.locator("#sidebarOverlay")).toHaveClass(/active/);

	await page.click(".chat-link");
	await expect(page).toHaveURL(/\/chat(?:\.html)?$/);
});

test("hamburger coordinate is not intercepted by terminal", async ({
	page,
}) => {
	await page.goto("/computer", { waitUntil: "domcontentloaded" });
	await page.waitForSelector("#mainSidebar");
	const button = page.locator("#hamburgerMenu");
	const box = await button.boundingBox();
	const hit = await page.evaluate(
		({ x, y }) =>
			document.elementFromPoint(x, y)?.closest("#hamburgerMenu")?.id,
		{ x: box.x + box.width / 2, y: box.y + box.height / 2 },
	);
	expect(hit).toBe("hamburgerMenu");
});
