import { describe, expect, it } from "vitest";
import { safeImagePath } from "./dom-utils.js";
import { renderImageCard } from "./cards/image.js";

describe("safeImagePath regression tests", () => {
	it("normalizes /api/v1/static/ paths correctly", () => {
		expect(
			safeImagePath("/api/v1/static/generated_images/20260822_105426_test.png"),
		).toBe("/v1/static/generated_images/20260822_105426_test.png");
		expect(
			safeImagePath("/api/v1/static/uploads/4db60f088833415eb2d69cee95084f72.jpg"),
		).toBe("/v1/static/uploads/4db60f088833415eb2d69cee95084f72.jpg");
	});

	it("normalizes /v1/static/ and relative static paths correctly", () => {
		expect(
			safeImagePath("/v1/static/generated_images/sample.png"),
		).toBe("/v1/static/generated_images/sample.png");
		expect(
			safeImagePath("static/generated_images/sample.png"),
		).toBe("/v1/static/generated_images/sample.png");
		expect(
			safeImagePath("generated_images/sample.png"),
		).toBe("/v1/static/generated_images/sample.png");
	});

	it("rejects traversal and invalid filenames", () => {
		expect(safeImagePath("/api/v1/static/generated_images/../secret.png")).toBeNull();
		expect(safeImagePath("/api/v1/static/generated_images/not-an-image.txt")).toBeNull();
		expect(safeImagePath("https://evil.com/image.png")).toBeNull();
		expect(safeImagePath("")).toBeNull();
		expect(safeImagePath(null)).toBeNull();
	});
});

describe("renderImageCard", () => {
	it("renders image card with safe path and copyable prompt", () => {
		const html = renderImageCard(
			{
				image_path: "/api/v1/static/generated_images/test.png",
				prompt: "A beautiful landscape",
				model: "flux",
			},
			"call_1",
			{ copyableContent: "A beautiful landscape" },
		);

		expect(html).toContain('class="tool-card tool-card--image"');
		expect(html).toContain('src="/v1/static/generated_images/test.png"');
		expect(html).toContain('href="/v1/static/generated_images/test.png"');
		expect(html).toContain("A beautiful landscape");
		expect(html).toContain("flux");
	});

	it("renders error card when image path is missing or invalid", () => {
		const html = renderImageCard(
			{
				image_path: "../invalid.png",
			},
			"call_2",
		);

		expect(html).toContain("image-card--error");
		expect(html).toContain("Image path missing or unsafe.");
	});
});
