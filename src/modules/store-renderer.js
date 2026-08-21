import { createMessageElement } from "./messages.js";
import { chatStore } from "./store.js";
import { escapeHtml, safeImagePath } from "./tool-renderer/dom-utils.js";
import "./fence-components.js";
import { loadKatex } from "./lazy-vendor.js";
import { patchContentContainer } from "./renderer/dom-patcher.js";
import {
	activateMessageFences,
	cancelMessageFenceWork,
	cleanupMessageFences,
} from "./renderer/fence-lifecycle.js";
import {
	installMarkedFenceRenderer,
	renderMessageHTML,
} from "./renderer/markdown-parser.js";
import {
	isNearBottom,
	scrollToBottom,
	shouldFollowBottom,
} from "./renderer/scroll-manager.js";

installMarkedFenceRenderer();

export class DOMRenderer {
	constructor(containerId) {
		this.container = document.getElementById(containerId);
		this.renderedIds = new Set();
		this.activeTypingIndicator = null;
		this.activeError = null;
		this.emptyStateEl = null;
		this.pendingRender = null;
		this.renderFrame = null;
		this.renderFrameCancel = null;
		this.lastRenderedMessageHashes = new Map();
		this.renderMetrics = new Map();
		this.unsubscribe = chatStore.subscribe(
			(messages, isGenerating, error, eventObj) =>
				this.scheduleRender(messages, isGenerating, error, eventObj),
		);
	}

	scheduleRender(messages, isGenerating, error = null, eventObj = null) {
		this.pendingRender = { messages, isGenerating, error, eventObj };
		if (this.renderFrame !== null) return;
		if (typeof requestAnimationFrame === "function") {
			this.renderFrameCancel = window.cancelAnimationFrame.bind(window);
			this.renderFrame = window.requestAnimationFrame(() => {
				this.renderFrame = null;
				this.renderFrameCancel = null;
				this._renderPending();
			});
		} else {
			this.renderFrameCancel = window.clearTimeout.bind(window);
			this.renderFrame = window.setTimeout(() => {
				this.renderFrame = null;
				this.renderFrameCancel = null;
				this._renderPending();
			}, 16);
		}
	}

	_renderPending() {
		const pending = this.pendingRender;
		this.pendingRender = null;
		if (pending)
			this.render(
				pending.messages,
				pending.isGenerating,
				pending.error,
				pending.eventObj,
			);
	}

	flushPendingRender() {
		if (this.renderFrame !== null) {
			this.renderFrameCancel?.(this.renderFrame);
			this.renderFrame = null;
			this.renderFrameCancel = null;
		}
		this._renderPending();
	}

	cancelPendingRender() {
		if (this.renderFrame !== null) {
			this.renderFrameCancel?.(this.renderFrame);
			this.renderFrame = null;
			this.renderFrameCancel = null;
		}
		this.pendingRender = null;
	}

	dispose() {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.cancelPendingRender();
		cancelMessageFenceWork();
		cleanupMessageFences(this.container);
		this.lastRenderedMessageHashes.clear();
		this.renderMetrics.clear();
		this.emptyStateEl?.remove();
		this.emptyStateEl = null;
	}

	render(messages, isGenerating, error = null, eventObj = null) {
		if (!this.container) return;

		// When history is reset or loaded, clear any initial static skeleton
		if (eventObj?.type === "reset") {
			const skeleton = document.getElementById("chatSkeletonContainer");
			if (skeleton) skeleton.remove();
		}

		const newRenderedIds = new Set();
		const isPrepend = eventObj?.type === "prepend";
		const firstOldElement = isPrepend ? this.container.firstElementChild : null;

		for (const msg of messages) {
			newRenderedIds.add(msg.id);
			let el = this.container.querySelector(`[data-message-id="${msg.id}"]`);
			if (!el) {
				el = this._createMessageDOM(msg);
				if (isPrepend && firstOldElement) {
					this.container.insertBefore(el, firstOldElement);
				} else {
					this.container.appendChild(el);
				}
				this._updateMessageDOM(el, msg);
				this.renderedIds.add(msg.id);
				if (!isPrepend && shouldFollowBottom(this.container)) scrollToBottom();
			} else {
				this._updateMessageDOM(el, msg);
				if (
					!isPrepend &&
					msg.role === "assistant" &&
					!msg.metadata?.isFrozen &&
					isNearBottom(this.container)
				)
					scrollToBottom();
			}
		}

		if (isPrepend && this.container._prependOldScrollHeight !== undefined) {
			const newScrollHeight = this.container.scrollHeight;
			this.container.scrollTop +=
				newScrollHeight - this.container._prependOldScrollHeight;
			this.container._prependOldScrollHeight = undefined;
		}

		for (const oldId of this.renderedIds) {
			if (!newRenderedIds.has(oldId)) {
				const oldElement = this.container.querySelector(
					`[data-message-id="${oldId}"]`,
				);
				if (oldElement) cleanupMessageFences(oldElement);
				oldElement?.remove();
				this.renderedIds.delete(oldId);
				this.lastRenderedMessageHashes.delete(oldId);
			}
		}
		this._syncError(error);
		for (const message of messages) {
			if (message.role !== "assistant") continue;
			const messageElement = this.container.querySelector(
				`[data-message-id="${message.id}"]`,
			);
			activateMessageFences(messageElement, message, isGenerating);
		}
		this._syncTypingIndicator(messages, isGenerating);
		this._syncEmptyState(messages, isGenerating, error);
		this.container.setAttribute("aria-busy", isGenerating ? "true" : "false");
	}

	_createMessageDOM(msg) {
		const el = createMessageElement(msg.role, msg.content, msg.timestamp, {
			suppressCopy: hasToolCard(msg),
		});
		el.setAttribute("data-message-id", msg.id);
		return el;
	}

	_updateMessageDOM(el, msg) {
		const contentContainer = el.querySelector(".message-content");
		if (!contentContainer) return;
		const shouldSuppressCopy = hasToolCard(msg);
		const parentCopyButton = el.querySelector('[data-action="copy-message"]');
		if (shouldSuppressCopy) {
			parentCopyButton?.remove();
		}

		// Assistant message is actively generating with no content yet -> render unified typing indicator
		if (msg.role === "assistant" && !msg.content && chatStore.isGenerating) {
			el.classList.add("message--typing");
			contentContainer.innerHTML = `
				<div class="typing-indicator" aria-label="Assistant is typing">
					<span></span><span></span><span></span>
				</div>
			`;
			return;
		}

		el.classList.remove("message--typing");
		const messageHash = JSON.stringify([
			msg.content || "",
			msg.metadata?.isFrozen ?? false,
			msg.toolCalls || [],
			msg.attachments || [],
			msg.toolResponse || null,
		]);
		if (this.lastRenderedMessageHashes.get(msg.id) === messageHash) return;
		this.lastRenderedMessageHashes.set(msg.id, messageHash);
		const metric = this.renderMetrics.get(msg.id) || { renderCount: 0 };
		metric.renderCount += 1;
		this.renderMetrics.set(msg.id, metric);
		let html = renderMessageHTML(msg);
		if (msg.attachments?.length) {
			html += `<div class="attachments">${msg.attachments.map((att) => this._renderAttachment(att)).join("")}</div>`;
		}
		if (msg.toolCalls?.length)
			html += `<div class="tools-container">${msg.toolCalls.map((tc) => this._renderToolCall(tc)).join("")}</div>`;
		patchContentContainer(contentContainer, html);
		this._enhanceContent(contentContainer);
		el.querySelector(".copy-message-btn")?.setAttribute(
			"data-message-content",
			msg.content || "",
		);
	}

	_renderAttachment(att) {
		const url = safeImagePath(att?.url || att?.path);
		if (!url) return "";
		return `<img src="${escapeHtml(url)}" class="attachment-img" alt="Attachment" />`;
	}

	_renderToolCall(tc) {
		const completed = tc.status === "completed";
		const failed = tc.status === "error";
		const statusIcon = completed ? "✓" : failed ? "!" : "…";
		const name = tc.name || tc?.function?.name || "tool";
		const state = completed ? "done" : failed ? "failed" : "working";
		const args = tc.arguments
			? `<pre><code>${escapeHtml(tc.arguments)}</code></pre>`
			: "Waiting for result...";
		if (completed)
			return `<span class="tool-call-summary tool-call-summary--done"><span aria-hidden="true">${statusIcon}</span><span>${escapeHtml(name)}</span></span>`;
		return `<details class="tool-call-block tool-call-block--${state}" open><summary class="tool-header"><span aria-hidden="true">${statusIcon}</span><span>Calling ${escapeHtml(name)}</span></summary><div class="tool-body">${args}</div></details>`;
	}

	_enhanceContent(contentContainer) {
		if (window.hljs)
			contentContainer.querySelectorAll("pre code").forEach((block) => {
				if (
					!block.closest("[data-fence-lang]") &&
					!block.classList.contains("hljs")
				)
					window.hljs.highlightElement(block);
			});
		// KaTeX is lazy-loaded: only fetch it when the message actually
		// contains math delimiters.
		const text = contentContainer.textContent || "";
		if (!text || !/\$|\\\(|\\\[/.test(text)) return;
		const renderMath = () => {
			if (!window.renderMathInElement) return;
			try {
				window.renderMathInElement(contentContainer, {
					delimiters: [
						{ left: "$$", right: "$$", display: true },
						{ left: "\\[", right: "\\]", display: true },
						{ left: "$", right: "$", display: false },
						{ left: "\\(", right: "\\)", display: false },
					],
					throwOnError: false,
				});
			} catch (_error) {
				return;
			}
		};
		if (window.renderMathInElement) {
			renderMath();
			return;
		}
		void loadKatex().then(renderMath);
	}

	_syncTypingIndicator(messages, isGenerating) {
		const hasActiveAssistant = messages.some(
			(m) => m.role === "assistant" && !m.metadata?.isFrozen,
		);
		if (this.activeTypingIndicator && !this.activeTypingIndicator.isConnected) {
			this.activeTypingIndicator = null;
		}
		// If an assistant message is already rendered in the DOM, the indicator is inside its bubble.
		// Only show the standalone fallback indicator if generation is active but no assistant message exists.
		if (isGenerating && !hasActiveAssistant && !this.activeTypingIndicator) {
			this.activeTypingIndicator = document.createElement("div");
			this.activeTypingIndicator.className = "typing-indicator";
			this.activeTypingIndicator.setAttribute(
				"aria-label",
				"Assistant is typing",
			);
			this.activeTypingIndicator.innerHTML =
				"<span></span><span></span><span></span>";
			this.container.appendChild(this.activeTypingIndicator);
			scrollToBottom();
			return;
		}
		if ((!isGenerating || hasActiveAssistant) && this.activeTypingIndicator) {
			this.activeTypingIndicator.remove();
			this.activeTypingIndicator = null;
		}
	}

	/**
	 * Show a friendly empty state when a session has no messages yet.
	 * Hidden while history is still loading (no session) or during a stream.
	 */
	_syncEmptyState(messages, isGenerating, error) {
		const shouldShow =
			Boolean(chatStore.sessionId) &&
			(!messages || messages.length === 0) &&
			!isGenerating &&
			!error;
		if (shouldShow && !this.emptyStateEl) {
			this.emptyStateEl = document.createElement("div");
			this.emptyStateEl.className = "chat-empty-state";
			this.emptyStateEl.innerHTML = `
				<div class="chat-empty-state__icon" aria-hidden="true">ฅ^•ﻌ•^ฅ</div>
				<h2 class="chat-empty-state__title">Start a conversation with Yuzu</h2>
				<p class="chat-empty-state__subtitle">Ask anything — code, ideas, or just a friendly chat.</p>
				<div class="chat-empty-state__suggestions">
					<button type="button" class="chat-empty-state__chip" data-suggestion="Help me debug a tricky bug in my code">Debug a bug</button>
					<button type="button" class="chat-empty-state__chip" data-suggestion="Explain how recursion works with a simple example">Explain a concept</button>
					<button type="button" class="chat-empty-state__chip" data-suggestion="Write a haiku about outer space">Write something</button>
				</div>
			`;
			for (const chip of this.emptyStateEl.querySelectorAll(
				"[data-suggestion]",
			)) {
				chip.addEventListener("click", () => {
					const input = document.getElementById("messageInput");
					if (input) {
						input.value = chip.dataset.suggestion;
						input.style.height = "auto";
						input.style.height = `${Math.min(input.scrollHeight, 400)}px`;
						input.dispatchEvent(new Event("input", { bubbles: true }));
					}
					document.getElementById("sendButton")?.click();
				});
			}
			this.container.appendChild(this.emptyStateEl);
			return;
		}
		if (!shouldShow && this.emptyStateEl) {
			this.emptyStateEl.remove();
			this.emptyStateEl = null;
		}
	}

	_syncError(error) {
		if (!error) {
			this.activeError?.remove();
			this.activeError = null;
			return;
		}
		if (!this.activeError) {
			this.activeError = document.createElement("div");
			this.activeError.className = "chat-runtime-error";
			this.activeError.setAttribute("role", "alert");
			this.container.appendChild(this.activeError);
		}
		this.activeError.textContent = error;
	}
}

function hasToolCard(msg) {
	return Boolean(
		msg?.toolResponse || (msg?.role === "assistant" && msg.toolCalls?.length),
	);
}

export const domRenderer = new DOMRenderer("chatContainer");
