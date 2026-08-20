// Playwright stub backend for E2E tests.
//
// Simulates the /v1 API facade the frontend needs:
//   - Cookie-gated auth: requests WITHOUT the `session` cookie get 401 (the
//     redirect-to-login path); requests WITH it are authenticated (happy path).
//   - Sessions list / switch / create, chat history (with pagination via
//     /chat_history/before), and SSE streaming for /send_message_stream.
//
// Started by playwright.config.js webServer; state is in-memory and reset via
// POST /v1/_reset (called from test beforeEach).
import http from "node:http";

const _SESSION_COOKIE = "session=test-session";

const baseTs = Date.now();
const iso = (ms) => new Date(ms).toISOString();

const BASE_HISTORY = {
	s1: [
		{ id: "m1", role: "user", content: "Hello there", timestamp: iso(baseTs) },
		{
			id: "m2",
			role: "assistant",
			content: "Hi! I'm Session One.",
			timestamp: iso(baseTs),
		},
	],
	s2: [
		{ id: "m3", role: "user", content: "What's up?", timestamp: iso(baseTs) },
		{
			id: "m4",
			role: "assistant",
			content: "I'm Session Two. Switch works!",
			timestamp: iso(baseTs),
		},
	],
	// Long seeded conversation so the chat container is genuinely scrollable;
	// deliberately NOT in BASE_SESSIONS (the happy-path spec asserts the exact
	// sidebar list) — reachable only via /chat.html?session=s-long.
	"s-long": Array.from({ length: 60 }, (_, i) => ({
		id: `long-${String(i + 1).padStart(2, "0")}`,
		role: i % 2 === 0 ? "user" : "assistant",
		content: `Long message ${String(i + 1).padStart(2, "0")}`,
		timestamp: iso(baseTs),
	})),
	// Session with an html fence so the sandboxed preview-shell flow (content
	// via postMessage under the app's strict CSP) is covered end-to-end;
	// reachable only via /chat.html?session=s-html.
	"s-html": [
		{
			id: "h1",
			role: "user",
			content: "Can you render this HTML?",
			timestamp: iso(baseTs),
		},
		{
			id: "h2",
			role: "assistant",
			content:
				"```html\n" +
				'<h1 id="preview-heading">Sandboxed preview works</h1>\n' +
				"<script>window.__previewRan = 'inline';</script>\n" +
				'<button id="preview-btn" onclick="window.__previewRan = \'click\';">Button</button>\n' +
				'<div style="height: 600px; background: #eef;">Tall region (proves auto-height)</div>\n' +
				"```",
			timestamp: iso(baseTs),
		},
	],
	// Session whose html fence is NEVER closed (the stream cut off): the
	// pending placeholder's data-fence-source gets stripped by DOMPurify (the
	// value contains </script>), so the hidden code carrier must preserve the
	// source. Reachable only via /chat.html?session=s-unclosed.
	"s-unclosed": [
		{
			id: "u1",
			role: "user",
			content: "Render this partial HTML?",
			timestamp: iso(baseTs),
		},
		{
			id: "u2",
			role: "assistant",
			content:
				"Here's the preview:\n\n```html\n" +
				"<script>window.__unclosedRan = 'yes';</script>\n" +
				'<p id="unclosed-para">Unclosed fence content</p>\n',
			timestamp: iso(baseTs),
		},
	],
	// Session seeded with stored-XSS payloads to prove markdown output is
	// sanitized; reachable only via /chat.html?session=s-xss.
	"s-xss": [
		{
			id: "x1",
			role: "user",
			content: "Render this for me?",
			timestamp: iso(baseTs),
		},
		{
			id: "x2",
			role: "assistant",
			content:
				'Injected <script>window.__xssPwned = "script"</script> ' +
				'<img src="x" onerror="window.__xssPwned = \'img\'"> ' +
				"[click](javascript:window.__xssPwned = 'link')",
			timestamp: iso(baseTs),
		},
	],
};

const BASE_SESSIONS = [
	{
		id: "s1",
		name: "Session One",
		message_count: 2,
		updated_at: iso(baseTs),
		is_active: true,
	},
	{
		id: "s2",
		name: "Session Two",
		message_count: 2,
		updated_at: iso(baseTs),
		is_active: false,
	},
];

// Mutable test state; /v1/_reset restores it to the base above.
let historyBySession = structuredClone(BASE_HISTORY);
let sessions = structuredClone(BASE_SESSIONS);
let nextSessionSeq = 3;

// Older-history batches served per session on successive /before calls.
const paginationBatches = [
	{
		chat_history: [
			{
				id: "m0a",
				role: "user",
				content: "Older message A",
				timestamp: iso(baseTs - 3_600_000),
			},
			{
				id: "m0b",
				role: "assistant",
				content: "Older message B",
				timestamp: iso(baseTs - 3_600_000),
			},
		],
		has_more: true,
	},
	{
		chat_history: [
			{
				id: "m0c",
				role: "user",
				content: "Even older message C",
				timestamp: iso(baseTs - 7_200_000),
			},
		],
		has_more: false,
	},
	{ chat_history: [], has_more: false },
];

// Mutable test state.
const beforeCounts = new Map(); // session_id -> number of /before calls
const beforeRequests = []; // recorded { session_id, before_ts }

function json(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"Content-Type": "application/json",
		"Content-Length": Buffer.byteLength(payload),
	});
	res.end(payload);
}

function readBody(req) {
	return new Promise((resolve) => {
		let data = "";
		req.on("data", (chunk) => (data += chunk));
		req.on("end", () => resolve(data));
	});
}

const isAuthenticated = (req) =>
	Boolean(
		req.headers.cookie?.includes("session=test-session") ||
			req.headers.cookie?.includes("yuzu_session=test-session"),
	);

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url, "http://localhost");
	const path = url.pathname;

	// Test-control endpoints (always available).
	if (path === "/v1/_debug") {
		return json(res, 200, { beforeRequests });
	}
	if (path === "/v1/_reset") {
		beforeCounts.clear();
		beforeRequests.length = 0;
		historyBySession = structuredClone(BASE_HISTORY);
		sessions = structuredClone(BASE_SESSIONS);
		nextSessionSeq = 3;
		return json(res, 200, { status: "success" });
	}

	// Everything else requires the session cookie.
	if (!isAuthenticated(req)) {
		return json(res, 401, { detail: "Not authenticated", status: "error" });
	}

	if (path === "/v1/auth/me") {
		return json(res, 200, {
			status: "success",
			user_id: "user-123",
			email: "tester@example.com",
			user_name: "Tester",
		});
	}
	if (path === "/v1/auth/logout") {
		return json(res, 200, { status: "success" });
	}
	if (path === "/v1/profile") {
		return json(res, 200, {
			status: "success",
			active_session: { id: "s1", name: "Session One" },
			partner_name: "Partner",
		});
	}
	if (path === "/v1/config") {
		return json(res, 200, {
			status: "success",
			current_provider: "stub",
			current_model: "stub-model",
			model_infos: {
				stub: [
					{
						id: "stub-model",
						capabilities: {
							vision: "supported",
							image_generation: "unsupported",
							reasoning: { mode: "supported" },
						},
					},
				],
			},
			ai_providers: { current_provider: "stub", current_model: "stub-model" },
			profile: {},
		});
	}
	if (path === "/v1/sessions/list") {
		return json(res, 200, { status: "success", sessions });
	}
	if (path === "/v1/sessions/create") {
		let name = "New Chat";
		try {
			name = JSON.parse(await readBody(req)).name || name;
		} catch {
			// ignore
		}
		const id = `s${nextSessionSeq}`;
		nextSessionSeq += 1;
		sessions.push({
			id,
			name,
			message_count: 0,
			updated_at: iso(Date.now()),
			is_active: false,
		});
		historyBySession[id] = [];
		return json(res, 200, { status: "success", session_id: id });
	}
	if (path === "/v1/sessions/rename") {
		try {
			const { session_id, name } = JSON.parse(await readBody(req));
			const session = sessions.find((s) => s.id === session_id);
			if (session && typeof name === "string" && name.trim()) {
				session.name = name.trim();
			}
		} catch {
			// ignore
		}
		return json(res, 200, { status: "success" });
	}
	if (req.method === "DELETE" && path.startsWith("/v1/sessions/")) {
		const id = path.slice("/v1/sessions/".length);
		sessions = sessions.filter((s) => s.id !== id);
		delete historyBySession[id];
		return json(res, 200, { status: "success" });
	}
	if (path === "/v1/sessions/switch" || path === "/v1/chat_history") {
		let sessionId = url.searchParams.get("session_id");
		if (!sessionId && req.method === "POST") {
			try {
				sessionId = JSON.parse(await readBody(req)).session_id;
			} catch {
				// ignore
			}
		}
		const sid = sessionId || "s1";
		return json(res, 200, {
			status: "success",
			active_session_id: sid,
			chat_history: historyBySession[sid] || [],
			has_more: true,
		});
	}
	if (path === "/v1/chat_history/before") {
		const sessionId = url.searchParams.get("session_id") || "s1";
		const beforeTs = url.searchParams.get("before_ts") || "";
		beforeRequests.push({ session_id: sessionId, before_ts: beforeTs });
		const count = beforeCounts.get(sessionId) || 0;
		beforeCounts.set(sessionId, count + 1);
		const batch = paginationBatches[count] || paginationBatches.at(-1);
		return json(res, 200, {
			status: "success",
			active_session_id: sessionId,
			chat_history: batch.chat_history,
			has_more: batch.has_more,
		});
	}
	if (path === "/v1/send_message_stream") {
		res.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		});
		const chunks = [
			{ type: "token", content: "Hello from the stub backend! " },
			{ type: "token", content: "This message was streamed in real time." },
			{ type: "done" },
		];
		let i = 0;
		const timer = setInterval(() => {
			if (i >= chunks.length) {
				clearInterval(timer);
				res.end();
				return;
			}
			res.write(`data: ${JSON.stringify(chunks[i])}\n\n`);
			i += 1;
		}, 60);
		return;
	}

	return json(res, 404, { status: "error", detail: `no stub route: ${path}` });
});

server.listen(5000, () => {
	console.log("E2E stub backend listening on :5000");
});
