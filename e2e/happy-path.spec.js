import { expect, test } from "@playwright/test";

const STUB = "http://localhost:5000";

// Authenticated happy path: session cookie set, so the stub serves real data.
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
	// Keep the shared stub in its base state (other specs mutate it).
	await fetch(`${STUB}/v1/_reset`, { method: "POST" });
});
test("browser back/forward switches sessions without a reload", async ({
	page,
}) => {
	// Start on Session One (history is fetched for s1).
	await page.goto("/chat.html?session=s1", {
		waitUntil: "domcontentloaded",
	});
	await page.waitForSelector("#mainSidebar");
	await expect(page.getByText("Hi! I'm Session One.")).toBeVisible();

	// Switch to Session Two via the sidebar (pushState, no reload).
	await page.click("#hamburgerMenu");
	await page
		.locator(".sidebar-session-item", { hasText: "Session Two" })
		.click();
	await expect(page.getByText("I'm Session Two. Switch works!")).toBeVisible();
	await expect(page).toHaveURL(/session=s2|\/chat\/s2/);

	// Back returns to Session One via the popstate handler — the s1 history
	// loads client-side, no page reload.
	await page.goBack();
	await expect(page).toHaveURL(/session=s1|\/chat\/s1/);
	await expect(page.getByText("Hello there")).toBeVisible();
	await expect(page.getByText("Hi! I'm Session One.")).toBeVisible();
	await expect(
		page.getByText("I'm Session Two. Switch works!"),
	).not.toBeVisible();

	// Forward returns to Session Two.
	await page.goForward();
	await expect(page).toHaveURL(/session=s2|\/chat\/s2/);
	await expect(page.getByText("I'm Session Two. Switch works!")).toBeVisible();
});

test("renders history, lists sessions, switches, and streams a reply", async ({
	page,
}) => {
	// 1. Initial history renders for the active session
	await page.goto("/chat.html", { waitUntil: "domcontentloaded" });
	await page.waitForSelector("#mainSidebar");
	await expect(page.getByText("Hi! I'm Session One.")).toBeVisible();

	// 2. Sidebar sessions list populates
	await page.click("#hamburgerMenu");
	await expect(page.locator("#mainSidebar.open")).toBeVisible();
	await expect(page.locator(".sidebar-session-name")).toHaveText([
		"Session One",
		"Session Two",
	]);

	// 3. Switch to Session Two via the sidebar
	await page
		.locator(".sidebar-session-item", { hasText: "Session Two" })
		.click();
	await expect(page.getByText("I'm Session Two. Switch works!")).toBeVisible();
	await expect(page).toHaveURL(/\/chat\/s2|session=s2/);

	// 4. Send a message; the SSE-streamed reply renders
	await page.fill("#messageInput", "ping from e2e");
	await page.click("#sendButton");
	await expect(page.getByText("Hello from the stub backend!")).toBeVisible();
	await expect(
		page.getByText("This message was streamed in real time."),
	).toBeVisible();
});
