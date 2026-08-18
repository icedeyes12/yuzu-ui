import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setStorageNamespace } from "./clientStorage.js";
import {
	applySavedTheme,
	applyTheme,
	DEFAULT_THEME,
	getSavedTheme,
	persistTheme,
} from "./theme.js";

beforeEach(() => {
	localStorage.clear();
	setStorageNamespace("");
	document.documentElement.removeAttribute("data-theme");
	document.body.removeAttribute("data-theme");
});

afterEach(() => {
	setStorageNamespace("");
	localStorage.clear();
});

// ── getSavedTheme fallback chain ─────────────────────────────────────────

describe("getSavedTheme", () => {
	it("returns the default theme when nothing is saved", () => {
		expect(getSavedTheme()).toBe(DEFAULT_THEME);
	});

	it("reads the generic saved theme key", () => {
		localStorage.setItem("theme", "mint");
		expect(getSavedTheme()).toBe("mint");
	});

	it("falls back to the document data-theme attribute", () => {
		document.documentElement.setAttribute("data-theme", "peach");
		expect(getSavedTheme()).toBe("peach");
	});

	it("prefers the user-scoped key when the storage namespace is set", () => {
		setStorageNamespace("123");
		localStorage.setItem("theme", "mint");
		localStorage.setItem("user_123_theme", "lavender");
		expect(getSavedTheme()).toBe("lavender");
	});

	it("falls through the chain when the user-scoped key is empty", () => {
		setStorageNamespace("123");
		localStorage.setItem("user_123_theme", "");
		localStorage.setItem("theme", "dark");
		expect(getSavedTheme()).toBe("dark");
	});
});

// ── apply ─────────────────────────────────────────────────────────────────

describe("applyTheme / applySavedTheme", () => {
	it("sets data-theme on both the document root and body", () => {
		applyTheme("tokyonight");
		expect(document.documentElement.getAttribute("data-theme")).toBe(
			"tokyonight",
		);
		expect(document.body.getAttribute("data-theme")).toBe("tokyonight");
	});

	it("applySavedTheme applies the saved theme", () => {
		localStorage.setItem("theme", "mint");
		applySavedTheme();
		expect(document.documentElement.getAttribute("data-theme")).toBe("mint");
		expect(document.body.getAttribute("data-theme")).toBe("mint");
	});
});

// ── persist ───────────────────────────────────────────────────────────────

describe("persistTheme", () => {
	it("writes the generic key always", () => {
		persistTheme("peach");
		expect(localStorage.getItem("theme")).toBe("peach");
	});

	it("also writes the user-scoped key when the namespace is set", () => {
		setStorageNamespace("123");
		persistTheme("lavender");
		expect(localStorage.getItem("theme")).toBe("lavender");
		expect(localStorage.getItem("user_123_theme")).toBe("lavender");
	});

	it("does not write a user-scoped key without a namespace", () => {
		persistTheme("dark");
		expect(localStorage.getItem("user_dark_theme")).toBeNull();
	});
});
