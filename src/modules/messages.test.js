// DOMPurify relies on a spec-compliant HTML parser; happy-dom mishandles
// embedded <script> content, so this file runs under jsdom instead.
// @vitest-environment jsdom

import { marked } from "marked";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Registers the html/mermaid/code fence handlers; markdown parsing needs the
// registry populated or the custom code renderer resolves no handler.
import "./fence-components.js";
import { flushPendingFenceBlocks } from "./fence-registry.js";
import { renderMessageContent } from "./messages.js";
import { renderMessageHTML } from "./renderer/markdown-parser.js";

// ── Helpers ──────────────────────────────────────────────────────────────

function setMarkedAvailable() {
	vi.stubGlobal("marked", marked);
	// The module treats a configured/installed marked as ready to parse.
	window._markedConfigured = true;
}

function setMarkedUnavailable() {
	vi.stubGlobal("marked", undefined);
	window._markedConfigured = false;
	window._fenceRendererInstalled = false;
}

beforeEach(() => {
	setMarkedAvailable();
});

afterEach(() => {
	vi.unstubAllGlobals();
	delete window._markedConfigured;
	delete window._fenceRendererInstalled;
});

// ── Sanitization (stored-XSS regression) ────────────────────────────────

describe("renderMessageContent sanitization", () => {
	it("strips <script> tags (and their contents) from message content", () => {
		const html = renderMessageContent(
			"Hello <script>alert(document.cookie)</script> world",
		);
		expect(html).not.toContain("<script");
		expect(html).not.toContain("alert(document.cookie)");
		expect(html).toContain("Hello");
		expect(html).toContain("world");
	});

	it("removes event-handler attributes from injected HTML", () => {
		const html = renderMessageContent('<img src="x" onerror="alert(1)">');
		expect(html).not.toContain("onerror");
		// The image itself survives sanitization; only the handler is dropped.
		expect(html).toContain("<img");
	});

	it("neutralizes javascript: URLs in links", () => {
		const html = renderMessageContent(
			'<a href="javascript:alert(1)">click me</a>',
		);
		expect(html).not.toContain("javascript:");
		expect(html).toContain("click me");
	});

	it("neutralizes javascript: URLs written as markdown links", () => {
		const html = renderMessageContent("[click me](javascript:alert(1))");
		expect(html).not.toContain("javascript:");
		expect(html).toContain("click me");
	});

	it("keeps benign markdown formatting intact", () => {
		const html = renderMessageContent(
			"**bold** and `inline code` and [a link](https://example.com)",
		);
		expect(html).toContain("<strong>bold</strong>");
		expect(html).toContain("<code>inline code</code>");
		expect(html).toContain('href="https://example.com"');
	});

	it("keeps safe HTML blocks the UI relies on (details/summary)", () => {
		const html = renderMessageContent(
			"<details><summary>More</summary>content</details>",
		);
		expect(html).toContain("<details>");
		expect(html).toContain("<summary>More</summary>");
	});

	it("escapes content when marked is unavailable", () => {
		setMarkedUnavailable();
		const html = renderMessageContent("<script>alert(1)</script>");
		expect(html).not.toContain("<script>");
		expect(html).toContain("&lt;script&gt;");
	});
});

// ── iframe allowlisting (html-preview fence) ────────────────────────────────

describe("renderMessageContent iframe policy", () => {
	it("keeps the fence iframe (hard-sandboxed, same-origin src) with its sandbox", () => {
		const html = renderMessageContent(
			'<iframe class="fence-html-iframe" sandbox="allow-scripts allow-forms allow-popups allow-modals" src="/preview-shell.html" title="HTML Preview"></iframe>',
		);
		expect(html).toContain('class="fence-html-iframe"');
		expect(html).toContain('sandbox="allow-scripts');
		expect(html).toContain('src="/preview-shell.html"');
	});

	it("drops iframes without a sandbox attribute", () => {
		const html = renderMessageContent(
			'<iframe src="https://evil.example"></iframe>',
		);
		expect(html).not.toContain("iframe");
	});

	it("drops iframes whose sandbox allows same-origin", () => {
		const html = renderMessageContent(
			'<iframe src="/chat.html" sandbox="allow-scripts allow-same-origin"></iframe>',
		);
		expect(html).not.toContain("iframe");
	});

	it("forbids srcdoc iframes entirely", () => {
		const html = renderMessageContent(
			'<iframe srcdoc="<script>alert(1)</script>" sandbox="allow-scripts"></iframe>',
		);
		expect(html).not.toContain("iframe");
	});

	it("blocks javascript: iframe sources", () => {
		const html = renderMessageContent(
			'<iframe src="javascript:alert(1)" sandbox="allow-scripts"></iframe>',
		);
		expect(html).not.toContain("iframe");
	});

	it("keeps benign sandboxed embeds", () => {
		const html = renderMessageContent(
			'<iframe src="https://example.com/embed" sandbox="allow-scripts allow-forms"></iframe>',
		);
		expect(html).toContain('src="https://example.com/embed"');
		expect(html).toContain("sandbox=");
	});
});

// ── Tool Result Event / Image Card Rendering ──────────────────────────────

describe("renderMessageHTML tool image result", () => {
	it("renders image card correctly for /api/v1/static/generated_images/... path", () => {
		const html = renderMessageHTML({
			role: "tool",
			content: JSON.stringify({
				ok: true,
				name: "image_generate",
				call_id: "call_123",
				data: {
					image_path: "/api/v1/static/generated_images/20260822_105426_test.png",
					prompt: "a cute anime catgirl",
					model: "flux-schnell",
				},
			}),
		});
		expect(html).toContain('class="tool-card tool-card--image"');
		expect(html).toContain('src="/v1/static/generated_images/20260822_105426_test.png"');
		expect(html).toContain('href="/v1/static/generated_images/20260822_105426_test.png"');
		expect(html).toContain("a cute anime catgirl");
		expect(html).toContain("flux-schnell");
	});

	it("renders image card correctly for /v1/static/generated_images/... path", () => {
		const html = renderMessageHTML({
			role: "tool",
			content: JSON.stringify({
				ok: true,
				name: "image_generate",
				call_id: "call_456",
				data: {
					image_path: "/v1/static/generated_images/20260822_105426_test2.png",
					prompt: "cyberpunk city",
				},
			}),
		});
		expect(html).toContain('class="tool-card tool-card--image"');
		expect(html).toContain('src="/v1/static/generated_images/20260822_105426_test2.png"');
	});
});

// A streamed message whose html fence never closes renders as a pending
// placeholder. Its data-fence-source is stripped by DOMPurify (values
// containing closing script tags), so the source must survive as sanitizer-
// inert text in a hidden code carrier for flushPendingFenceBlocks to recover.

describe("unclosed html fence with script during streaming", () => {
	const UNCLOSED_HTML = "```html\n<script>alert(1)</script>\n<p>hello</p>\n";

	it("keeps the placeholder's hidden code carrier", () => {
		const html = renderMessageHTML({
			role: "assistant",
			content: UNCLOSED_HTML,
		});
		expect(html).toContain("fence-block--pending");
		expect(html).toContain("fence-pending-source");
		expect(html).toContain("hidden");
		// The script content survives as sanitizer-inert escaped text.
		expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
	});

	it("flushPendingFenceBlocks recovers the source from the code carrier when data-fence-source is stripped", () => {
		const html = renderMessageHTML({
			role: "assistant",
			content: UNCLOSED_HTML,
		});
		const container = document.createElement("div");
		document.body.appendChild(container);
		container.innerHTML = html;
		// Simulate the browser-side DOMPurify strip: Chromium drops data-*
		// values containing closing script tags, jsdom's parser does not.
		delete container.querySelector(".fence-block--pending").dataset.fenceSource;

		const flushed = flushPendingFenceBlocks(container);
		expect(flushed).toBe(1);

		const block = container.querySelector(".fence-block--html-preview");
		expect(block).not.toBeNull();
		expect(block.querySelector("iframe")).not.toBeNull();
		// The full source is carried into the real component: escaped in the
		// attribute and verbatim in the hidden source code block.
		expect(block.dataset.fenceSource).toContain("<script>alert(1)</script>");
		expect(
			block.querySelector(".fence-html-source-block code")?.textContent,
		).toContain("<script>alert(1)</script>");
		expect(
			block.querySelector(".fence-html-source-block code")?.textContent,
		).toContain("<p>hello</p>");

		container.remove();
	});
});
