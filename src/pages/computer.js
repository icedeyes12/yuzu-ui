/**
 * My Computer Page Controller.
 * Manages State Transitions, xterm.js Terminal & PTY WebSocket.
 */

import { toggleSidebar } from "../components/sidebar.js";
import { bootApp } from "../main.js";
import { SandboxService } from "../modules/sandbox-service.js";

// DOM Elements
let viewEmpty, viewTransition, viewReady;
let sandboxBadge, connStatus;
let termContainer;
let terminal, fitAddon, socket;

async function init() {
	const me = await bootApp({ page: "computer" });
	if (!me) return;

	// Bind Elements
	viewEmpty = document.getElementById("viewEmpty");
	viewTransition = document.getElementById("viewTransition");
	viewReady = document.getElementById("viewReady");
	sandboxBadge = document.getElementById("sandboxBadge");
	connStatus = document.getElementById("connStatus");
	termContainer = document.getElementById("terminalContainer");

	const sidebarToggle = document.getElementById("sidebarToggle");
	if (sidebarToggle) {
		sidebarToggle.addEventListener("click", () => toggleSidebar());
	}

	bindActions();
	await checkStatus();
}

function bindActions() {
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
}

async function checkStatus() {
	try {
		const status = await SandboxService.getStatus();
		updateUI(status);
	} catch (err) {
		console.error("Status check failed", err);
	}
}

function updateUI(status) {
	if (!status?.has_sandbox || status.state === "none") {
		showView("empty");
		if (sandboxBadge) sandboxBadge.textContent = "Not Provisioned";
		return;
	}

	if (status.state === "ready") {
		showView("ready");
		if (sandboxBadge)
			sandboxBadge.textContent = `${status.distribution} (Ready)`;
		initTerminal();
	} else if (status.state === "failed") {
		showView("empty");
		if (sandboxBadge) sandboxBadge.textContent = "Failed";
		alert(`Sandbox error: ${status.last_error || "Unknown failure"}`);
	} else {
		showTransition(`Status: ${status.state}`, "Sandbox is transitioning...");
		pollUntilReady();
	}
}

function showView(view) {
	if (viewEmpty) viewEmpty.classList.toggle("hidden", view !== "empty");
	if (viewTransition)
		viewTransition.classList.toggle("hidden", view !== "transition");
	if (viewReady) viewReady.classList.toggle("hidden", view !== "ready");
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
		const status = await SandboxService.getStatus();
		if (status.state === "ready" || status.state === "failed") {
			updateUI(status);
		} else {
			pollUntilReady();
		}
	}, 2000);
}

function initTerminal() {
	if (terminal || !termContainer) return;

	// Check if xterm is available from global CDN script or fallback
	if (window.Terminal) {
		terminal = new window.Terminal({
			theme: {
				background: "#0d1117",
				foreground: "#c9d1d9",
				cursor: "#58a6ff",
			},
			fontSize: 14,
			fontFamily: 'Menlo, Monaco, "Courier New", monospace',
		});

		if (window.FitAddon) {
			fitAddon = new window.FitAddon.FitAddon();
			terminal.loadAddon(fitAddon);
		}

		terminal.open(termContainer);
		if (fitAddon) fitAddon.fit();

		connectWebSocket();
	} else {
		termContainer.innerHTML =
			'<div class="alert alert-info" style="color:white;padding:1rem;">Connecting to PTY stream...</div>';
		connectWebSocket();
	}
}

function connectWebSocket() {
	const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
	const wsUrl = `${protocol}//${window.location.host}/api/v1/sandbox/terminal/ws`;

	if (connStatus) connStatus.textContent = "Connecting...";

	try {
		socket = new WebSocket(wsUrl);

		socket.onopen = () => {
			if (connStatus) connStatus.textContent = "Connected";
			if (terminal)
				terminal.writeln(
					"\x1b[32m[Connected to My Computer Sandbox]\x1b[0m\r\n",
				);
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
			if (connStatus) connStatus.textContent = "Disconnected";
			if (terminal)
				terminal.writeln("\r\n\x1b[31m[Session Disconnected]\x1b[0m");
		};

		if (terminal) {
			terminal.onData((data) => {
				if (socket && socket.readyState === WebSocket.OPEN) {
					socket.send(JSON.stringify({ type: "input", data }));
				}
			});
		}
	} catch (_e) {
		if (connStatus) connStatus.textContent = "Connection Error";
	}
}

// Auto-init on page load
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", init);
} else {
	init();
}
