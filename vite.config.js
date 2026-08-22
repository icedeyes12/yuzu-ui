import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";

const entry = (name) => resolve(import.meta.dirname, name);

// Clean-route -> MPA entry mapping. Mirrors the backend SPA routes in
// main.py so the same URLs work in dev, local single-origin, and the
// Phase 4 static-host deployment.
const ROUTE_ENTRIES = {
	"/": "index.html",
	"/login": "login.html",
	"/chat": "chat.html",
	"/config": "config.html",
	"/about": "about.html",
};

function mpaFallback() {
	return {
		name: "mpa-clean-route-fallback",
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				if (req.method !== "GET") return next();
				const pathname = new URL(req.url, "http://localhost").pathname;
				if (pathname === "/preview-shell.html") {
					// Serve the sandbox preview shell raw, without Vite's HTML
					// transform: the injected @vite/client module cannot load in
					// the opaque-origin sandbox (CORS) and the shell needs no HMR
					// (its content arrives via postMessage).
					res.setHeader("Content-Type", "text/html; charset=utf-8");
					res.end(readFileSync(entry("preview-shell.html")));
					return;
				}
				let entryName = ROUTE_ENTRIES[pathname];
				// /chat/{session_id} deep links resolve to the chat entry; the
				// SPA reads the session id from the path on boot.
				if (!entryName && pathname.startsWith("/chat/")) {
					entryName = "chat.html";
				}
				if (entryName) {
					req.url = `/${entryName}`;
				}
				next();
			});
		},
	};
}

const CSP_DIRECTIVE =
	"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https://api.yuzuki.space http://localhost:5000 http://127.0.0.1:5000 ws: wss:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'self'";

function cspPlugin() {
	return {
		name: "vite-plugin-csp-injector",
		transformIndexHtml(html, ctx) {
			if (ctx.filename?.endsWith("preview-shell.html")) {
				return html;
			}
			return html.replace(
				/<meta http-equiv="Content-Security-Policy"[^>]*>/i,
				`<meta http-equiv="Content-Security-Policy" content="${CSP_DIRECTIVE}">`,
			);
		},
	};
}

// Multi-page SPA: one HTML entry per page. The backend serves the built
// web/dist in local single-origin mode; a static host (Phase 4) rewrites
// /chat/* and friends to these entries.
export default defineConfig({
	base: "/",
	plugins: [mpaFallback(), cspPlugin()],
	build: {
		outDir: "dist",
		rollupOptions: {
			input: {
				home: entry("index.html"),
				login: entry("login.html"),
				chat: entry("chat.html"),
				computer: entry("computer.html"),
				config: entry("config.html"),
				about: entry("about.html"),
				preview: entry("preview-shell.html"),
			},
			output: {
				// Stable vendor chunk (marked + highlight.js) so app-only deploys
				// keep the shared chunk cached by returning visitors. Mermaid and
				// KaTeX are code-split into their own dynamic chunks on demand.
				manualChunks(id) {
					if (
						id.includes("node_modules/highlight.js") ||
						id.includes("node_modules/marked")
					) {
						return "vendor";
					}
					return undefined;
				},
			},
		},
	},
	test: {
		environment: "happy-dom",
		// Playwright specs live in e2e/ and must not be collected by vitest.
		exclude: [...configDefaults.exclude, "e2e/**"],
	},
	server: {
		port: 5173,
		proxy: {
			// Everything under /v1 (plus legacy /api compatibility path)
			// proxies to the local FastAPI backend.
			"/v1": {
				target: "http://localhost:5000",
				changeOrigin: true,
			},
			"/api": {
				target: "http://localhost:5000",
				changeOrigin: true,
			},
		},
	},
});
