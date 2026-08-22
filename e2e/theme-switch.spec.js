import { expect, test } from "@playwright/test";

const STUB = "http://localhost:5000";

// One dark, one light, and the three pastel themes from the sidebar dropdown.
const THEMES = [
	{ value: "dark", label: "Dark Blue" },
	{ value: "light", label: "Soft Light" },
	{ value: "lavender", label: "Pastel Lavender" },
	{ value: "mint", label: "Pastel Mint" },
	{ value: "peach", label: "Pastel Peach" },
];

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

async function openSidebar(page) {
	await page.goto("/chat", { waitUntil: "domcontentloaded" });
	await page.waitForSelector("#hamburgerMenu");
	await page.click("#hamburgerMenu");
	await expect(page.locator("#mainSidebar")).toHaveClass(/open/);
}

async function selectTheme(page, value, label) {
	const dropdown = page.locator("#themeDropdown");
	await dropdown.locator(".dropdown-selected").click();
	// The button announces the open state.
	await expect(
		page.locator("#themeDropdown .dropdown-selected"),
	).toHaveAttribute("aria-expanded", "true");
	await page
		.locator(`#themeDropdown .dropdown-option[data-value="${value}"]`)
		.click({ force: true });

	// Applied to both the document root and body.
	await expect(page.locator("html")).toHaveAttribute("data-theme", value);
	await expect(page.locator("body")).toHaveAttribute("data-theme", value);
	// Dropdown reflects the selection and closes.
	await expect(page.locator("#themeDropdown .selected-text")).toHaveText(label);
	await expect(
		page.locator(`#themeDropdown .dropdown-option[data-value="${value}"]`),
	).toHaveClass(/active/);
	await expect(
		page.locator("#themeDropdown .dropdown-options"),
	).not.toHaveClass(/active/);
	// aria-expanded flips back to false when the list closes.
	await expect(
		page.locator("#themeDropdown .dropdown-selected"),
	).toHaveAttribute("aria-expanded", "false");
	// Persisted for the session.
	const persisted = await page.evaluate(() => localStorage.getItem("theme"));
	expect(persisted).toBe(value);
}

for (const theme of THEMES) {
	test(`switches to ${theme.label} via the sidebar dropdown`, async ({
		page,
	}) => {
		await openSidebar(page);
		await selectTheme(page, theme.value, theme.label);
	});
}

test("theme persists across a page reload", async ({ page }) => {
	await openSidebar(page);
	await selectTheme(page, "mint", "Pastel Mint");

	// The pre-paint inline script and applySavedTheme() both read storage.
	await page.reload({ waitUntil: "domcontentloaded" });
	await expect(page.locator("html")).toHaveAttribute("data-theme", "mint");
	await expect(page.locator("body")).toHaveAttribute("data-theme", "mint");

	// The sidebar remounts and syncs its dropdown to the saved theme.
	await page.waitForSelector("#mainSidebar");
	await expect(page.locator("#themeDropdown .selected-text")).toHaveText(
		"Pastel Mint",
	);
});

test("outside click closes the dropdown and resets aria-expanded", async ({
	page,
}) => {
	await openSidebar(page);
	await page.click("#themeDropdown .dropdown-selected");
	await expect(
		page.locator("#themeDropdown .dropdown-selected"),
	).toHaveAttribute("aria-expanded", "true");

	// Click outside the dropdown (the sidebar header) to dismiss.
	await page.click(".sidebar-header");
	await expect(
		page.locator("#themeDropdown .dropdown-options"),
	).not.toHaveClass(/active/);
	await expect(
		page.locator("#themeDropdown .dropdown-selected"),
	).toHaveAttribute("aria-expanded", "false");
});

test("keyboard: ArrowDown opens the list and Enter selects the focused option", async ({
	page,
}) => {
	await openSidebar(page);
	await page.focus("#themeDropdown .dropdown-selected");

	// ArrowDown opens the listbox and moves focus to the first option.
	await page.keyboard.press("ArrowDown");
	await expect(page.locator("#themeDropdown .dropdown-options")).toHaveClass(
		/active/,
	);
	await expect(
		page.locator("#themeDropdown .dropdown-option[data-value='dark']"),
	).toBeFocused();

	// ArrowDown moves to the next option; Enter selects it.
	await page.keyboard.press("ArrowDown");
	await expect(
		page.locator("#themeDropdown .dropdown-option[data-value='light']"),
	).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
	await expect(page.locator("#themeDropdown .selected-text")).toHaveText(
		"Soft Light",
	);
	// The list closes and aria-expanded flips back.
	await expect(
		page.locator("#themeDropdown .dropdown-options"),
	).not.toHaveClass(/active/);
	await expect(
		page.locator("#themeDropdown .dropdown-selected"),
	).toHaveAttribute("aria-expanded", "false");
});

test("keyboard: ArrowUp opens at the last option, Home/End jump, Escape returns focus", async ({
	page,
}) => {
	await openSidebar(page);
	await page.focus("#themeDropdown .dropdown-selected");

	// ArrowUp opens the listbox at the last option.
	await page.keyboard.press("ArrowUp");
	await expect(
		page.locator(
			"#themeDropdown .dropdown-option[data-value='vanilla-orange']",
		),
	).toBeFocused();

	// Home/End jump to the first/last option.
	await page.keyboard.press("Home");
	await expect(
		page.locator("#themeDropdown .dropdown-option[data-value='dark']"),
	).toBeFocused();
	await page.keyboard.press("End");
	await expect(
		page.locator(
			"#themeDropdown .dropdown-option[data-value='vanilla-orange']",
		),
	).toBeFocused();

	// Escape closes the list and returns focus to the button (and does not
	// close the sidebar drawer — stopPropagation).
	await page.keyboard.press("Escape");
	await expect(
		page.locator("#themeDropdown .dropdown-options"),
	).not.toHaveClass(/active/);
	await expect(page.locator("#themeDropdown .dropdown-selected")).toBeFocused();
	await expect(page.locator("#mainSidebar")).toHaveClass(/open/);
});

test("theme button announces the listbox it controls", async ({ page }) => {
	await openSidebar(page);
	await expect(
		page.locator("#themeDropdown .dropdown-selected"),
	).toHaveAttribute("aria-controls", "themeDropdownOptions");
	await expect(page.locator("#themeDropdownOptions")).toHaveAttribute(
		"role",
		"listbox",
	);
});
