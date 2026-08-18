/**
 * FILE: static/js/modules/fence-components.js
 * DESCRIPTION: Concrete fence-block handlers: default code, mermaid, html.
 *
 * Each handler implements { strategy, buildHTML, activate }.
 * All components:
 *   - preserve raw source (stored in data-fence-source)
 *   - expose a Copy button
 *   - expose an Inspect toggle where applicable
 */

import {
	escAttr,
	registerFenceCancellation,
	registerFenceCleanup,
	registerFenceHandler,
} from "./fence-registry.js";
import { loadMermaid } from "./lazy-vendor.js";
import { isNearBottom, scrollToBottom } from "./scroll.js";

// ── Copy helper (shared) ─────────────────────────────────────────────────────

function copyToClipboard(text) {
	void navigator.clipboard?.writeText(text).catch(() => {});
}

// ── Icon helpers (inline SVGs, no emoji, Lucide-style) ───────────────────────

function iconCopy() {
	return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
}

function iconInspect() {
	return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
}

// ── Common header builder ─────────────────────────────────────────────────────

/**
 * Build a standard block header HTML string.
 *
 * @param {string} label        — left-side text (language badge)
 * @param {string[]} actions    — array of action button HTML strings
 * @returns {string}
 */
function buildHeader(label, actions = []) {
	const actionsHtml = actions.join("");
	return `<div class="fence-header">
  <span class="fence-lang-badge">${escAttr(label)}</span>
  <div class="fence-actions">${actionsHtml}</div>
</div>`;
}

function buildCopyBtn() {
	return `<button class="fence-action-btn fence-copy-btn" title="Copy" type="button">${iconCopy()} Copy</button>`;
}

function buildInspectBtn() {
	return `<button class="fence-action-btn fence-inspect-btn" title="Toggle source" type="button">${iconInspect()} Inspect</button>`;
}

// ── Default code block handler ────────────────────────────────────────────────

/**
 * Default handler: immediate rendering with hljs.
 * Wraps the standard <pre><code> in a styled container with a header.
 */
const defaultCodeHandler = {
	strategy: "immediate",

	buildHTML(source, lang) {
		const header = buildHeader(lang || "code", [buildCopyBtn()]);
		const escapedSource = escAttr(source);
		const langClass = lang ? ` class="language-${escAttr(lang)}"` : "";
		return `<div class="fence-block fence-block--code" data-fence-lang="${escAttr(lang)}" data-fence-source="${escapedSource}">
  ${header}
  <pre><code${langClass}>${escapedSource}</code></pre>
</div>`;
	},

	activate(el, _source) {
		const codeEl = el.querySelector("pre code");
		// data-fence-source is stripped by DOMPurify when the source contains
		// closing script/style tags, so fall back to the escaped code text
		// (sanitizer-inert text with the identical content).
		const raw = el.dataset.fenceSource || codeEl?.textContent || "";
		// Copy button
		el.querySelector(".fence-copy-btn")?.addEventListener("click", () => {
			copyToClipboard(raw);
			const btn = el.querySelector(".fence-copy-btn");
			if (btn) {
				btn.textContent = "Copied!";
				setTimeout(() => {
					btn.innerHTML = `${iconCopy()} Copy`;
				}, 1200);
			}
		});

		// hljs highlight
		if (codeEl && window.hljs && !codeEl.classList.contains("hljs")) {
			window.hljs.highlightElement(codeEl);
		}
	},
};

registerFenceHandler("__default__", defaultCodeHandler);

// ── Mermaid handler ───────────────────────────────────────────────────────────

const mermaidRenderTokens = new WeakMap();
const mermaidMetrics = { renderCount: 0, renderDurationMs: 0 };

export function getMermaidMetrics() {
	return { ...mermaidMetrics };
}

async function renderMermaidDiagram(diagramEl, source) {
	if (!diagramEl?.isConnected) return;
	const activeRender = mermaidRenderTokens.get(diagramEl);
	if (activeRender?.state === "rendering" && activeRender.source === source)
		return;
	if (
		diagramEl.dataset.fenceRenderSource === source &&
		diagramEl.dataset.fenceRenderState === "rendered"
	) {
		return;
	}
	diagramEl.dataset.fenceRenderSource = source;
	if (!window.mermaid) {
		diagramEl.dataset.fenceRenderState = "pending";
		try {
			await loadMermaid();
		} catch (error) {
			console.warn("Mermaid failed to load:", error);
			if (!diagramEl.isConnected) return;
			diagramEl.dataset.fenceRenderState = "error";
			diagramEl.innerHTML = `<pre class="mermaid-fallback"><code>${escAttr(source)}</code></pre>`;
			return;
		}
	}

	if (!window._mermaidInitialized) {
		try {
			window.mermaid.initialize({
				startOnLoad: false,
				securityLevel: "loose",
				theme: "dark",
			});
			window._mermaidInitialized = true;
		} catch (error) {
			console.warn("Mermaid initialization failed:", error);
			diagramEl.dataset.fenceRenderState = "error";
			return;
		}
	}

	if (typeof window.mermaid.render !== "function") {
		diagramEl.dataset.fenceRenderState = "error";
		diagramEl.innerHTML = `<pre class="mermaid-fallback"><code>${escAttr(source)}</code></pre>`;
		return;
	}

	const renderToken = { source, state: "rendering" };
	mermaidRenderTokens.set(diagramEl, renderToken);
	diagramEl.dataset.fenceRenderState = "rendering";
	const renderId = `mermaid-svg-${Math.random().toString(36).slice(2, 9)}`;
	try {
		const startedAt = performance.now();
		const result = await window.mermaid.render(renderId, source);
		mermaidMetrics.renderCount += 1;
		mermaidMetrics.renderDurationMs += performance.now() - startedAt;
		if (
			!diagramEl.isConnected ||
			mermaidRenderTokens.get(diagramEl) !== renderToken
		)
			return;
		diagramEl.innerHTML = result.svg;
		result.bindFunctions?.(diagramEl);
		renderToken.state = "rendered";
		diagramEl.dataset.fenceRenderState = "rendered";
	} catch (error) {
		console.warn("Mermaid rendering failed:", error);
		if (
			!diagramEl.isConnected ||
			mermaidRenderTokens.get(diagramEl) !== renderToken
		)
			return;
		diagramEl.innerHTML = `<pre class="mermaid-fallback"><code>${escAttr(source)}</code></pre>`;
		renderToken.state = "error";
		diagramEl.dataset.fenceRenderState = "error";
	}
}

function retryPendingMermaidDiagrams() {
	for (const el of document.querySelectorAll(
		'[data-fence-lang="mermaid"][data-fence-activated]',
	)) {
		const diagramEl = el.querySelector(".fence-mermaid-diagram");
		if (
			diagramEl?.dataset.fenceRenderState === "pending" &&
			el.dataset.fenceSource
		) {
			void renderMermaidDiagram(diagramEl, el.dataset.fenceSource);
		}
	}
}

if (typeof window !== "undefined" && !window._mermaidRetryListenerInstalled) {
	window._mermaidRetryListenerInstalled = true;
	window.addEventListener("load", retryPendingMermaidDiagrams, { once: true });
}

const mermaidHandler = {
	strategy: "buffered",

	buildHTML(source, _lang) {
		const header = buildHeader("Mermaid", [buildInspectBtn(), buildCopyBtn()]);
		return `<div class="fence-block fence-block--mermaid" data-fence-lang="mermaid" data-fence-source="${escAttr(source)}" data-fence-strategy="buffered">
  ${header}
  <div class="fence-mermaid-body">
    <div class="fence-mermaid-diagram" data-view="diagram"></div>
    <div class="fence-mermaid-source" data-view="source" hidden><pre class="fence-raw-code"><code class="language-mermaid">${escAttr(source)}</code></pre></div>
  </div>
</div>`;
	},

	activate(el, source) {
		const diagramEl = el.querySelector(".fence-mermaid-diagram");
		const sourceEl = el.querySelector(".fence-mermaid-source");
		const inspectBtn = el.querySelector(".fence-inspect-btn");
		const rawSource =
			source || sourceEl?.querySelector("pre code")?.textContent || "";
		let showingSource = false;

		inspectBtn?.addEventListener("click", () => {
			showingSource = !showingSource;
			if (diagramEl) diagramEl.hidden = showingSource;
			if (sourceEl) sourceEl.hidden = !showingSource;
			inspectBtn.classList.toggle("fence-action-btn--active", showingSource);

			if (showingSource && sourceEl) {
				const codeEl = sourceEl.querySelector("pre code");
				if (codeEl && window.hljs && !codeEl.classList.contains("hljs")) {
					window.hljs.highlightElement(codeEl);
				}
			}
		});

		el.querySelector(".fence-copy-btn")?.addEventListener("click", () => {
			copyToClipboard(rawSource);
			const btn = el.querySelector(".fence-copy-btn");
			if (btn) {
				btn.textContent = "Copied!";
				setTimeout(() => {
					btn.innerHTML = `${iconCopy()} Copy`;
				}, 1200);
			}
		});

		if (diagramEl) void renderMermaidDiagram(diagramEl, rawSource);
		registerFenceCancellation(el, () => {
			if (diagramEl) mermaidRenderTokens.delete(diagramEl);
		});
		registerFenceCleanup(el, () => {
			if (diagramEl) mermaidRenderTokens.delete(diagramEl);
		});
	},
};

registerFenceHandler("mermaid", mermaidHandler);

// ── HTML preview handler ──────────────────────────────────────────────────────

// Global window message listener for sandboxed iframe height auto-resizing
if (typeof window !== "undefined" && !window._htmlResizeListenerInstalled) {
	window._htmlResizeListenerInstalled = true;
	window.addEventListener("message", (event) => {
		if (event.data?.type === "yuzu-html-resize" && event.data?.height) {
			const iframes = document.querySelectorAll(".fence-html-iframe");
			for (const iframe of iframes) {
				if (iframe.contentWindow === event.source) {
					const targetH = Math.max(380, Math.ceil(event.data.height) + 24);
					iframe.style.height = `${targetH}px`;
					const chatContainer = document.getElementById("chatContainer");
					if (chatContainer && isNearBottom(chatContainer)) scrollToBottom();
					break;
				}
			}
		}
	});
}

const htmlPreviewHandler = {
	strategy: "buffered",

	buildHTML(source, _lang) {
		const header = buildHeader("HTML Preview", [
			buildInspectBtn(),
			buildCopyBtn(),
		]);

		// The preview content is delivered via postMessage to preview-shell.html
		// (a same-origin page loaded in a sandboxed iframe). Kept out of the URL
		// so there is no length ceiling and no direct-visit injection vector.
		return `<div class="fence-block fence-block--html-preview" data-fence-lang="html" data-fence-source="${escAttr(source)}" data-fence-strategy="buffered">
  ${header}
  <div class="fence-html-body" data-fence-preview-state="loading">
    <div class="fence-html-loading" aria-live="polite">Rendering preview…</div>
    <iframe class="fence-html-iframe" sandbox="allow-scripts allow-forms allow-popups allow-modals" src="/preview-shell.html" title="HTML Preview"></iframe>
    <div class="fence-html-source-block" hidden><pre class="fence-raw-code"><code class="language-html">${escAttr(source)}</code></pre></div>
  </div>
</div>`;
	},

	activate(el, source) {
		const iframe = el.querySelector(".fence-html-iframe");
		const sourceBlock = el.querySelector(".fence-html-source-block");
		const previewBody = el.querySelector(".fence-html-body");
		const loadingEl = el.querySelector(".fence-html-loading");
		const inspectBtn = el.querySelector(".fence-inspect-btn");
		let showingSource = false;

		// Activate inner inspect code block once on load
		if (sourceBlock) {
			const codeEl = sourceBlock.querySelector("pre code");
			if (codeEl && window.hljs && !codeEl.classList.contains("hljs")) {
				window.hljs.highlightElement(codeEl);
			}
		}

		// data-fence-source is stripped by DOMPurify when the fence source
		// contains closing script/style tags, so derive the raw source from the
		// escaped source code block (sanitizer-inert text, identical content).
		const rawSource =
			source || sourceBlock?.querySelector("pre code")?.textContent || "";

		const onLoad = () => {
			previewBody?.setAttribute("data-fence-preview-state", "ready");
			loadingEl?.remove();
			// Deliver the previewed HTML now that the shell's message listener is
			// attached. targetOrigin must be "*" because the sandboxed iframe has
			// an opaque origin; the shell validates the sender via event.origin.
			iframe?.contentWindow?.postMessage(
				{ type: "yuzu-html-content", content: rawSource },
				"*",
			);
		};
		iframe?.addEventListener("load", onLoad, { once: true });

		function setView(showSource) {
			showingSource = showSource;
			if (iframe) iframe.hidden = showingSource;
			if (sourceBlock) sourceBlock.hidden = !showingSource;
			if (loadingEl) {
				loadingEl.hidden =
					showingSource || previewBody?.dataset.fencePreviewState === "ready";
			}
			inspectBtn?.classList.toggle("fence-action-btn--active", showingSource);
			inspectBtn?.setAttribute("aria-pressed", String(showingSource));
		}

		setView(false);
		inspectBtn?.addEventListener("click", () => setView(!showingSource));
		registerFenceCleanup(el, () => {
			iframe?.removeEventListener("load", onLoad);
			if (iframe) iframe.srcdoc = "";
		});

		// Copy always uses raw source
		el.querySelector(".fence-copy-btn")?.addEventListener("click", () => {
			copyToClipboard(rawSource);
			const btn = el.querySelector(".fence-copy-btn");
			if (btn) {
				btn.textContent = "Copied!";
				setTimeout(() => {
					btn.innerHTML = `${iconCopy()} Copy`;
				}, 1200);
			}
		});
	},
};

registerFenceHandler("html", htmlPreviewHandler);
