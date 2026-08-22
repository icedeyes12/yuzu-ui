/**
 * My Computer Page Controller.
 * Manages State Transitions, xterm.js Terminal & PTY WebSocket with Proper Lifecycle.
 */

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { toggleSidebar } from "../components/sidebar.js";
import { bootApp } from "../main.js";
import { apiUrl } from "../modules/apiFetch.js";
import { SandboxService } from "../modules/sandbox-service.js";

// DOM Elements
let viewBootstrapping, viewEmpty, viewTransition, viewReady, viewFailed;
let sandboxBadge, computerStatusSubtitle, connStatus, connStatusDot, failedDesc;
let metaDistro, metaGeneration, metaStorage, managePanel, btnToggleManage;
let termContainer;
let terminal = null;
let fitAddon = null;
let socket = null;
let resizeObserver = null;
let currentStatus = null;

// Terminal State Machine: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'failed'
let _terminalState = "idle";

async function init() {
	const me = await bootApp({ page: "computer" });
	if (!me) return;

	// Bind Elements
	viewBootstrapping = document.getElementById("viewBootstrapping");
	viewEmpty = document.getElementById("viewEmpty");
	viewTransition = document.getElementById("viewTransition");
	viewReady = document.getElementById("viewReady");
	viewFailed = document.getElementById("viewFailed");
	failedDesc = document.getElementById("failedDesc");
	sandboxBadge = document.getElementById("sandboxBadge");
	computerStatusSubtitle = document.getElementById("computerStatusSubtitle");
	connStatus = document.getElementById("connStatus");
	connStatusDot = document.getElementById("connStatusDot");
	termContainer = document.getElementById("terminalContainer");
	managePanel = document.getElementById("managePanel");
	btnToggleManage = document.getElementById("btnToggleManage");

	metaDistro = document.getElementById("metaDistro");
	metaGeneration = document.getElementById("metaGeneration");
	metaStorage = document.getElementById("metaStorage");

	const hamburgerMenu = document.getElementById("hamburgerMenu");
	if (hamburgerMenu) {
		hamburgerMenu.addEventListener("click", () => toggleSidebar());
	}

	bindActions();
	await checkStatus();
}

function bindActions() {
	if (btnToggleManage && managePanel) {
		btnToggleManage.addEventListener("click", () => {
			const isHidden = managePanel.classList.toggle("hidden");
			btnToggleManage.setAttribute("aria-expanded", String(!isHidden));
		});
	}

	const formProvision = document.getElementById("formProvision");
	if (formProvision) {
		formProvision.addEventListener("submit", async (e) => {
			e.preventDefault();
			const select = document.getElementById("selectDistro");
			const distro = select ? select.value : "debian";
			if (confirm("Provision personal persistent Linux environment?")) {
				showTransition(
					`Provisioning ${distro}...`,
					"Setting up your container rootfs.",
				);
				try {
					await SandboxService.provision(distro);
					pollUntilReady();
				} catch (err) {
					alert(`Failed to provision: ${err.message}`);
					await checkStatus();
				}
			}
		});
	}

	const btnReset = document.getElementById("btnReset");
	if (btnReset) {
		btnReset.addEventListener("click", async () => {
			const conf = prompt(
				"Type 'RESET' to re-provision sandbox (all local files will be deleted):",
			);
			if (conf === "RESET") {
				showTransition(
					"Resetting Sandbox...",
					"Re-bootstrapping clean workspace.",
				);
				try {
					await SandboxService.reset("RESET");
					pollUntilReady();
				} catch (err) {
					alert(`Reset failed: ${err.message}`);
					await checkStatus();
				}
			}
		});
	}

	const btnDelete = document.getElementById("btnDelete");
	if (btnDelete) {
		btnDelete.addEventListener("click", async () => {
			const conf = prompt("Type 'DELETE' to permanently remove your sandbox:");
			if (conf === "DELETE") {
				try {
					await SandboxService.deleteSandbox("DELETE");
					await checkStatus();
				} catch (err) {
					alert(`Delete failed: ${err.message}`);
				}
			}
		});
	}

	const btnRetry = document.getElementById("btnRetry");
	if (btnRetry) {
		btnRetry.addEventListener("click", () => {
			showView("bootstrapping");
			checkStatus();
		});
	}
}

async function checkStatus() {
	try {
		currentStatus = await SandboxService.getStatus();
		updateUI(currentStatus);
	} catch (err) {
		console.error("Status check failed", err);
		showView("failed");
		if (failedDesc)
			failedDesc.textContent =
				err.message || "Failed to contact sandbox backend.";
		if (sandboxBadge) sandboxBadge.textContent = "Error";
	}
}

function updateUI(status) {
	if (!status?.has_sandbox || status.state === "none") {
		cleanupTerminal();
		showView("empty");
		if (sandboxBadge) sandboxBadge.textContent = "Not Provisioned";
		if (computerStatusSubtitle)
			computerStatusSubtitle.textContent = "No Environment";
		return;
	}

	if (status.state === "ready") {
		showView("ready");
		if (sandboxBadge)
			sandboxBadge.textContent = `${status.distribution} (Ready)`;
		if (computerStatusSubtitle)
			computerStatusSubtitle.textContent = `${status.distribution} 12 · Ready`;

		// Populate secondary management metadata
		if (metaDistro) metaDistro.textContent = status.distribution || "Debian";
		if (metaGeneration)
			metaGeneration.textContent = `Gen ${status.generation || 1}`;
		if (metaStorage)
			metaStorage.textContent = `${Math.round((status.storage_limit_bytes || 10737418240) / 1073741824)} GiB Limit`;

		initTerminal();
	} else if (status.state === "failed") {
		cleanupTerminal();
		showView("failed");
		if (failedDesc)
			failedDesc.textContent =
				status.last_error || "Sandbox provisioning failed.";
		if (sandboxBadge) sandboxBadge.textContent = "Failed";
		if (computerStatusSubtitle)
			computerStatusSubtitle.textContent = "Provisioning Failed";
	} else {
		cleanupTerminal();
		showTransition(`Status: ${status.state}`, "Sandbox is transitioning...");
		pollUntilReady();
	}
}

function showView(view) {
	if (viewBootstrapping)
		viewBootstrapping.classList.toggle("hidden", view !== "bootstrapping");
	if (viewEmpty) viewEmpty.classList.toggle("hidden", view !== "empty");
	if (viewTransition)
		viewTransition.classList.toggle("hidden", view !== "transition");
	if (viewReady) viewReady.classList.toggle("hidden", view !== "ready");
	if (viewFailed) viewFailed.classList.toggle("hidden", view !== "failed");
}

function showTransition(title, desc) {
	showView("transition");
	const tTitle = document.getElementById("transitionTitle");
	const tDesc = document.getElementById("transitionDesc");
	if (tTitle) tTitle.textContent = title;
	if (tDesc) tDesc.textContent = desc;
}

function pollUntilReady() {
	setTimeout(async () => {
		try {
			const status = await SandboxService.getStatus();
			if (
				status.state === "ready" ||
				status.state === "failed" ||
				status.state === "none"
			) {
				updateUI(status);
			} else {
				pollUntilReady();
			}
		} catch (e) {
			console.warn("Poll failed, retrying in 3s...", e);
			pollUntilReady();
		}
	}, 2000);
}

function setTerminalState(state, message = "") {
	_terminalState = state;
	if (connStatus) connStatus.textContent = message || state;
	if (connStatusDot) {
		connStatusDot.className = `status-dot ${state}`;
	}
}

function initTerminal() {
	if (terminal || !termContainer) return;

	termContainer.innerHTML = ""; // Clear any placeholder

	terminal = new Terminal({
		theme: {
			background: "#000000",
			foreground: "#c9d1d9",
			cursor: "#58a6ff",
			selectionBackground: "#388bfd33",
		},
		fontSize: 14,
		fontFamily: 'Menlo, Monaco, "Courier New", monospace',
		cursorBlink: true,
		allowProposedApi: true,
	});

	fitAddon = new FitAddon();
	terminal.loadAddon(fitAddon);
	terminal.open(termContainer);

	try {
		fitAddon.fit();
	} catch (e) {
		console.warn("Initial fitAddon failed:", e);
	}

	// Setup ResizeObserver for responsive layout changes & mobile orientation
	if (window.ResizeObserver) {
		resizeObserver = new ResizeObserver(() => {
			if (fitAddon && terminal) {
				try {
					fitAddon.fit();
					if (socket && socket.readyState === WebSocket.OPEN) {
						socket.send(
							JSON.stringify({
								type: "resize",
								cols: terminal.cols,
								rows: terminal.rows,
							}),
						);
					}
				} catch (_e) {}
			}
		});
		resizeObserver.observe(termContainer);
	}

	connectWebSocket();
}

function connectWebSocket() {
	const httpEndpoint = apiUrl("/v1/sandbox/terminal/ws");
	// Ensure secure wss: on https origins
	let wsUrl = httpEndpoint;
	if (wsUrl.startsWith("https://")) {
		wsUrl = wsUrl.replace("https://", "wss://");
	} else if (wsUrl.startsWith("http://")) {
		wsUrl = wsUrl.replace("http://", "ws://");
	} else {
		// Relative path fallback
		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		wsUrl = `${protocol}//${window.location.host}${wsUrl.startsWith("/") ? "" : "/"}${wsUrl}`;
	}

	setTerminalState("connecting", "Connecting to PTY...");

	try {
		socket = new WebSocket(wsUrl);

		socket.onopen = () => {
			setTerminalState("connected", "Connected");
			if (terminal) {
				terminal.focus();
				// Trigger initial resize framing
				if (fitAddon) {
					fitAddon.fit();
					socket.send(
						JSON.stringify({
							type: "resize",
							cols: terminal.cols,
							rows: terminal.rows,
						}),
					);
				}
			}
		};

		socket.onmessage = (event) => {
			try {
				const payload = JSON.parse(event.data);
				if (payload.type === "output" && terminal) {
					terminal.write(payload.data);
				}
			} catch {
				if (terminal) terminal.write(event.data);
			}
		};

		socket.onclose = () => {
			setTerminalState("disconnected", "Session Disconnected");
			if (terminal)
				terminal.writeln("\r\n\x1b[31m[Session Disconnected]\x1b[0m");
		};

		socket.onerror = () => {
			setTerminalState("failed", "PTY Connection Error");
		};

		if (terminal) {
			terminal.onData((data) => {
				if (socket && socket.readyState === WebSocket.OPEN) {
					socket.send(JSON.stringify({ type: "input", data }));
				}
			});
		}
	} catch (e) {
		console.error("PTY WebSocket creation failed:", e);
		setTerminalState("failed", "Connection Failed");
	}
}

function cleanupTerminal() {
	if (resizeObserver) {
		resizeObserver.disconnect();
		resizeObserver = null;
	}
	if (socket) {
		try {
			socket.close();
		} catch (_e) {}
		socket = null;
	}
	if (terminal) {
		try {
			terminal.dispose();
		} catch (_e) {}
		terminal = null;
		fitAddon = null;
	}
	setTerminalState("idle", "");
}

// Cleanup on navigation away
window.addEventListener("beforeunload", cleanupTerminal);

// Auto-init on page load
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", init);
} else {
	init();
}
