import { expect, test } from "@playwright/test";

const STUB = "http://localhost:5000";

// Mobile viewport: the sidebar behaves as an off-canvas drawer.
test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
	await page.context().addCookies([
		{ name: "session", value: "test-session", url: "http://localhost:5173" },
		{
			name: "yuzu_session",
			value: "test-session",
			url: "http://localhost:5173",
		},
		{ name: "session", value: "test-session", url: "http://localhost:5000" },
		{
			name: "yuzu_session",
			value: "test-session",
			url: "http://localhost:5000",
		},
	]);
	await fetch(`${STUB}/v1/_reset`, { method: "POST" });
});

async function openChatPage(page) {
	await page.goto("/chat.html", { waitUntil: "domcontentloaded" });
	// The sidebar mounts after first paint (requestIdleCallback).
	await page.waitForSelector("#mainSidebar");
	// The overlay is CSS-hidden until the drawer opens — just needs to exist.
	await page.waitForSelector("#sidebarOverlay", { state: "attached" });
}

test("hamburger opens the sidebar drawer and overlay", async ({ page }) => {
	await openChatPage(page);

	await page.click("#hamburgerMenu");

	await expect(page.locator("#mainSidebar")).toHaveClass(/open/);
	await expect(page.locator("#sidebarOverlay")).toHaveClass(/active/);
	await expect(page.locator("#hamburgerMenu")).toHaveAttribute(
		"aria-expanded",
		"true",
	);
});

test("Escape closes the drawer", async ({ page }) => {
	await openChatPage(page);
	await page.click("#hamburgerMenu");
	await expect(page.locator("#mainSidebar")).toHaveClass(/open/);

	await page.keyboard.press("Escape");

	await expect(page.locator("#mainSidebar")).not.toHaveClass(/open/);
	await expect(page.locator("#sidebarOverlay")).not.toHaveClass(/active/);
	await expect(page.locator("#hamburgerMenu")).toHaveAttribute(
		"aria-expanded",
		"false",
	);
});

test("clicking the overlay dismisses the drawer", async ({ page }) => {
	await openChatPage(page);
	await page.click("#hamburgerMenu");
	await expect(page.locator("#mainSidebar")).toHaveClass(/open/);

	// Click near the right edge so the hit lands on the overlay, not the drawer.
	await page.locator("#sidebarOverlay").click({ position: { x: 370, y: 400 } });

	await expect(page.locator("#mainSidebar")).not.toHaveClass(/open/);
	await expect(page.locator("#sidebarOverlay")).not.toHaveClass(/active/);
});

test("the close (×) button dismisses the drawer", async ({ page }) => {
	await openChatPage(page);
	await page.click("#hamburgerMenu");
	await expect(page.locator("#mainSidebar")).toHaveClass(/open/);

	await page.click(".close-sidebar");

	await expect(page.locator("#mainSidebar")).not.toHaveClass(/open/);
	await expect(page.locator("#sidebarOverlay")).not.toHaveClass(/active/);
	await expect(page.locator("#hamburgerMenu")).toHaveAttribute(
		"aria-expanded",
		"false",
	);
});

const NAV_LINKS = [".chat-link", ".home-link", ".config-link", ".about-link"];

for (const selector of NAV_LINKS) {
	test(`${selector} dismisses the drawer`, async ({ page }) => {
		await openChatPage(page);
		await page.click("#hamburgerMenu");
		await expect(page.locator("#mainSidebar")).toHaveClass(/open/);

		// Keep the page from unloading so the drawer state is observable:
		// a capture-phase listener cancels the link's navigation while the
		// click still bubbles to the app's document-level handler.
		await page.evaluate((sel) => {
			document
				.querySelector(sel)
				.addEventListener("click", (e) => e.preventDefault(), true);
		}, selector);

		await page.click(selector);

		await expect(page.locator("#mainSidebar")).not.toHaveClass(/open/);
		await expect(page.locator("#sidebarOverlay")).not.toHaveClass(/active/);
		await expect(page.locator("#hamburgerMenu")).toHaveAttribute(
			"aria-expanded",
			"false",
		);
	});
}

test("a nav link navigates to its page with the drawer dismissed", async ({
	page,
}) => {
	await openChatPage(page);
	await page.click("#hamburgerMenu");
	await expect(page.locator("#mainSidebar")).toHaveClass(/open/);

	await page.click(".config-link");
	await expect(page).toHaveURL(/\/config\.html/);

	// Fresh page: the sidebar remounts with the drawer closed.
	await page.waitForSelector("#mainSidebar");
	await expect(page.locator("#mainSidebar")).not.toHaveClass(/open/);
	await expect(page.locator("#hamburgerMenu")).toHaveAttribute(
		"aria-expanded",
		"false",
	);
});
