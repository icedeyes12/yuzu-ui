/**
 * On-demand loaders for the heavy optional renderers (mermaid, KaTeX).
 *
 * These libraries used to be part of the static vendor bundle and shipped to
 * every chat visitor (~3 MB of mermaid diagram chunks plus KaTeX fonts).
 * They are now fetched from the network only the first time a diagram or
 * math block actually appears in a message. The window globals are kept so
 * the existing renderer code paths work unchanged once loaded.
 */

let mermaidPromise = null;

/**
 * Ensure mermaid is loaded and available at `window.mermaid`.
 * @returns {Promise<object>} The mermaid module.
 */
export function loadMermaid() {
	if (window.mermaid) return Promise.resolve(window.mermaid);
	mermaidPromise ??= import("mermaid").then((module) => {
		window.mermaid = module.default;
		return window.mermaid;
	});
	return mermaidPromise;
}

let katexPromise = null;

/**
 * Ensure KaTeX + auto-render are loaded and available at `window.katex`
 * and `window.renderMathInElement`.
 * @returns {Promise<Function>} The auto-render function.
 */
export function loadKatex() {
	if (window.renderMathInElement) {
		return Promise.resolve(window.renderMathInElement);
	}
	katexPromise ??= Promise.all([
		import("katex"),
		import("katex/contrib/auto-render"),
		import("katex/dist/katex.min.css"),
	]).then(([katexModule, autoRenderModule]) => {
		window.katex = katexModule.default;
		window.renderMathInElement = autoRenderModule.default;
		return window.renderMathInElement;
	});
	return katexPromise;
}
