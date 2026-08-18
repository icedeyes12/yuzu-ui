import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initScrollReveal } from "./scroll-reveal.js";

// ── DOM + global stubs ──────────────────────────────────────────────────

// matchMedia is stubbed per-test so the reduced-motion branch can be toggled.
function stubMatchMedia(matches) {
	vi.stubGlobal(
		"matchMedia",
		vi.fn(() => ({
			matches,
			media: "",
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		})),
	);
}

// happy-dom does not implement IntersectionObserver; capture instances so
// tests can drive their callbacks and assert on their options.
class FakeIntersectionObserver {
	static instances = [];

	constructor(callback, options) {
		this.callback = callback;
		this.options = options;
		this.observed = [];
		this.disconnected = false;
		FakeIntersectionObserver.instances.push(this);
	}

	observe(target) {
		this.observed.push(target);
	}

	disconnect() {
		this.disconnected = true;
	}
}

function setupSections(count = 1, selector = ".test-section") {
	const sections = [];
	for (let i = 0; i < count; i++) {
		const section = document.createElement("section");
		section.className = selector.slice(1);
		const input = document.createElement("input");
		section.appendChild(input);
		document.body.appendChild(section);
		sections.push(section);
	}
	return sections;
}

const focusin = (target) =>
	target.dispatchEvent(new Event("focusin", { bubbles: true }));

// Track disposers so each test tears down its document-level focus listener
// (a listener from one test would otherwise fire in later tests).
let disposers = [];

function initReveal(...args) {
	const dispose = initScrollReveal(...args);
	disposers.push(dispose);
	return dispose;
}

beforeEach(() => {
	document.body.innerHTML = "";
	FakeIntersectionObserver.instances = [];
	disposers = [];
	vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
});

afterEach(() => {
	disposers.forEach((dispose) => {
		dispose();
	});
	vi.unstubAllGlobals();
	document.body.innerHTML = "";
});

// ── Reduced motion ───────────────────────────────────────────────────────

describe("initScrollReveal with reduced motion", () => {
	it("leaves sections untouched and wires nothing", () => {
		stubMatchMedia(true);
		const sections = setupSections(2);

		const dispose = initReveal(".test-section");

		expect(
			sections.every(
				(section) => !section.classList.contains("animate-on-scroll"),
			),
		).toBe(true);
		expect(FakeIntersectionObserver.instances).toHaveLength(0);
		expect(typeof dispose).toBe("function");
		expect(() => dispose()).not.toThrow();
	});

	it("does not reveal sections on focus under reduced motion", () => {
		stubMatchMedia(true);
		const [section] = setupSections(1);

		initReveal(".test-section");
		focusin(section.querySelector("input"));

		expect(section.classList.contains("is-visible")).toBe(false);
	});
});

// ── Observer setup ───────────────────────────────────────────────────────

describe("initScrollReveal observer setup", () => {
	it("adds animate-on-scroll to and observes every matching section", () => {
		stubMatchMedia(false);
		const sections = setupSections(3);

		initReveal(".test-section");

		sections.forEach((section) => {
			expect(section.classList.contains("animate-on-scroll")).toBe(true);
		});
		const observer = FakeIntersectionObserver.instances[0];
		expect(observer).toBeDefined();
		expect(observer.observed).toEqual(sections);
	});

	it("uses the default threshold and rootMargin", () => {
		stubMatchMedia(false);
		setupSections(1);

		initReveal(".test-section");

		expect(FakeIntersectionObserver.instances[0].options).toEqual({
			threshold: 0.1,
			rootMargin: "0px 0px -50px 0px",
		});
	});

	it("honors custom threshold and rootMargin", () => {
		stubMatchMedia(false);
		setupSections(1);

		initReveal(".test-section", {
			threshold: 0.25,
			rootMargin: "10px",
		});

		expect(FakeIntersectionObserver.instances[0].options).toEqual({
			threshold: 0.25,
			rootMargin: "10px",
		});
	});

	it("ignores sections that do not match the selector", () => {
		stubMatchMedia(false);
		setupSections(1, ".other-section");

		initReveal(".test-section");

		expect(FakeIntersectionObserver.instances[0].observed).toHaveLength(0);
	});
});

// ── Intersection reveal ──────────────────────────────────────────────────

describe("initScrollReveal intersection reveal", () => {
	it("adds is-visible when a section intersects", () => {
		stubMatchMedia(false);
		const [section] = setupSections(1);
		initReveal(".test-section");

		FakeIntersectionObserver.instances[0].callback([
			{ isIntersecting: true, target: section },
		]);

		expect(section.classList.contains("is-visible")).toBe(true);
	});

	it("ignores entries that are not intersecting", () => {
		stubMatchMedia(false);
		const [section] = setupSections(1);
		initReveal(".test-section");

		FakeIntersectionObserver.instances[0].callback([
			{ isIntersecting: false, target: section },
		]);

		expect(section.classList.contains("is-visible")).toBe(false);
	});
});

// ── Focus reveal ─────────────────────────────────────────────────────────

describe("initScrollReveal focus reveal", () => {
	it("reveals the section containing the focused element", () => {
		stubMatchMedia(false);
		const sections = setupSections(2);
		initReveal(".test-section");

		focusin(sections[1].querySelector("input"));

		expect(sections[1].classList.contains("is-visible")).toBe(true);
		expect(sections[0].classList.contains("is-visible")).toBe(false);
	});

	it("reveals a section that already holds focus at init", () => {
		stubMatchMedia(false);
		const sections = setupSections(2);
		vi.spyOn(document, "activeElement", "get").mockReturnValue(
			sections[1].querySelector("input"),
		);

		initReveal(".test-section");

		expect(sections[1].classList.contains("is-visible")).toBe(true);
		expect(sections[0].classList.contains("is-visible")).toBe(false);
	});

	it("ignores focus events outside any section", () => {
		stubMatchMedia(false);
		const [section] = setupSections(1);
		initReveal(".test-section");

		focusin(document.body);

		expect(section.classList.contains("is-visible")).toBe(false);
	});
});

// ── Cleanup ──────────────────────────────────────────────────────────────

describe("initScrollReveal cleanup", () => {
	it("disconnects the observer and stops revealing on focus", () => {
		stubMatchMedia(false);
		const [section] = setupSections(1);
		const dispose = initReveal(".test-section");
		const observer = FakeIntersectionObserver.instances[0];

		dispose();

		expect(observer.disconnected).toBe(true);
		focusin(section.querySelector("input"));
		expect(section.classList.contains("is-visible")).toBe(false);
	});
});
