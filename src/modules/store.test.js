import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConversationStore } from "./store.js";

beforeEach(() => {
	vi.restoreAllMocks();
});

// ── Basics ────────────────────────────────────────────────────────────────

describe("ConversationStore basics", () => {
	it("starts empty with no session and no generation in flight", () => {
		const store = new ConversationStore();
		expect(store.sessionId).toBeNull();
		expect(store.messages).toEqual([]);
		expect(store.isGenerating).toBe(false);
		expect(store.error).toBeNull();
	});

	it("notifies subscribers with the full state on changes", () => {
		const store = new ConversationStore();
		const subscriber = vi.fn();
		store.subscribe(subscriber);

		store.appendMessage({ id: "m1", role: "user", content: "hi" });

		expect(subscriber).toHaveBeenCalledTimes(1);
		const [messages, isGenerating, error, eventObj] = subscriber.mock.calls[0];
		expect(messages).toHaveLength(1);
		expect(isGenerating).toBe(false);
		expect(error).toBeNull();
		expect(eventObj).toEqual({ type: "update" });
	});

	it("unsubscribe stops future notifications", () => {
		const store = new ConversationStore();
		const subscriber = vi.fn();
		const unsubscribe = store.subscribe(subscriber);

		store.appendMessage({ id: "m1", role: "user", content: "hi" });
		expect(subscriber).toHaveBeenCalledTimes(1);

		unsubscribe();
		store.appendMessage({ id: "m2", role: "assistant", content: "yo" });
		expect(subscriber).toHaveBeenCalledTimes(1);
	});
});

// ── History loading and prepending ────────────────────────────────────────

describe("ConversationStore history", () => {
	it("loadHistory replaces state, freezes messages, and notifies reset", () => {
		const store = new ConversationStore();
		const subscriber = vi.fn();
		store.subscribe(subscriber);

		store.loadHistory(
			"sess-1",
			[
				{ id: "a", role: "user", content: "one" },
				{ id: "b", role: "assistant", content: "two" },
			],
			true,
		);

		expect(store.sessionId).toBe("sess-1");
		expect(store.hasMoreOlder).toBe(true);
		expect(store.messages.map((m) => m.id)).toEqual(["a", "b"]);
		expect(store.messages.every((m) => m.metadata.isFrozen)).toBe(true);
		const [messages, , , eventObj] = subscriber.mock.calls.at(-1);
		expect(messages.map((m) => m.id)).toEqual(["a", "b"]);
		expect(eventObj.type).toBe("reset");
	});

	it("prependHistory dedupes by id and prepends only new messages", () => {
		const store = new ConversationStore();
		store.loadHistory("s", [
			{ id: "a", role: "user", content: "one" },
			{ id: "b", role: "assistant", content: "two" },
		]);
		const subscriber = vi.fn();
		store.subscribe(subscriber);

		store.prependHistory(
			[
				{ id: "b", role: "assistant", content: "two" }, // duplicate
				{ id: "c", role: "user", content: "three" }, // new
			],
			true,
		);

		expect(store.messages.map((m) => m.id)).toEqual(["c", "a", "b"]);
		expect(store.hasMoreOlder).toBe(true);
		const [messages, , , eventObj] = subscriber.mock.calls[0];
		expect(messages.map((m) => m.id)).toEqual(["c", "a", "b"]);
		expect(eventObj).toEqual({ type: "prepend", addedCount: 1 });
	});

	it("prependHistory with an empty batch only updates hasMoreOlder", () => {
		const store = new ConversationStore();
		store.loadHistory("s", [{ id: "a", role: "user", content: "one" }]);
		const subscriber = vi.fn();
		store.subscribe(subscriber);

		store.prependHistory([], false);

		expect(store.hasMoreOlder).toBe(false);
		expect(subscriber).not.toHaveBeenCalled();
	});
});

// ── Appending and merging ─────────────────────────────────────────────────

describe("ConversationStore append", () => {
	it("appendMessage adds new messages and merges existing ones by id", () => {
		const store = new ConversationStore();
		store.appendMessage({ id: "m1", role: "user", content: "hello" });
		store.appendMessage({ id: "m2", role: "assistant", content: "world" });

		// Updating m2 keeps its position but replaces its content.
		store.appendMessage({ id: "m2", role: "assistant", content: "world!" });

		expect(store.messages.map((m) => m.id)).toEqual(["m1", "m2"]);
		expect(store.messages[1].content).toBe("world!");
	});

	it("appendMessage ignores messages with an invalid role", () => {
		const store = new ConversationStore();
		store.appendMessage({ id: "x", role: "banana", content: "nope" });
		expect(store.messages).toHaveLength(0);
	});

	it("getMessageById finds messages or returns null", () => {
		const store = new ConversationStore();
		store.appendMessage({ id: "m1", role: "user", content: "hi" });
		expect(store.getMessageById("m1")?.content).toBe("hi");
		expect(store.getMessageById("missing")).toBeNull();
	});
});

// ── Generation lifecycle ──────────────────────────────────────────────────

describe("ConversationStore generation", () => {
	it("startGeneration/finishGeneration flip isGenerating and freeze owned messages", () => {
		const store = new ConversationStore();
		store.loadHistory("s", [{ id: "a", role: "user", content: "q" }]);
		store.beginAssistantMessage();
		expect(store.messages.at(-1).role).toBe("assistant");
		expect(store.messages.at(-1).metadata.isFrozen).toBe(false);

		store.startGeneration();
		expect(store.isGenerating).toBe(true);

		store.finishGeneration();
		expect(store.isGenerating).toBe(false);
		expect(store.messages.at(-1).metadata.isFrozen).toBe(true);
	});

	it("appendAssistantToken appends to the active assistant message", () => {
		const store = new ConversationStore();
		store.beginAssistantMessage();
		store.appendAssistantToken("Hello");
		store.appendAssistantToken(" world");
		expect(store.messages.at(-1).content).toBe("Hello world");
	});

	it("appendAssistantToken ignores frozen or missing assistant messages", () => {
		const store = new ConversationStore();
		store.appendAssistantToken("no active message");
		expect(store.messages).toHaveLength(0);

		store.appendMessage({
			id: "a",
			role: "assistant",
			content: "",
			isFrozen: true,
		});
		store.appendAssistantToken("ignored");
		expect(store.messages.at(-1).content).toBe("");
	});

	it("appendAssistantToken ignores non-string chunks", () => {
		const store = new ConversationStore();
		store.beginAssistantMessage();
		store.appendAssistantToken(null);
		store.appendAssistantToken(42);
		expect(store.messages.at(-1).content).toBe("");
	});

	it("updateToolCall adds a tool call and updates it by id", () => {
		const store = new ConversationStore();
		store.beginAssistantMessage();
		store.updateToolCall({
			id: "call-1",
			name: "search",
			arguments_chunk: '{"q":"x"}',
		});
		store.updateToolCall({
			id: "call-1",
			name: "search",
			arguments_chunk: '{"q":"y"}',
			status: "completed",
		});

		const calls = store.messages.at(-1).toolCalls;
		expect(calls).toHaveLength(1);
		expect(calls[0].arguments).toBe('{"q":"y"}');
		expect(calls[0].status).toBe("completed");
	});

	it("setError records the error and stops generating", () => {
		const store = new ConversationStore();
		const subscriber = vi.fn();
		store.subscribe(subscriber);

		store.startGeneration();
		store.setError("boom");

		expect(store.error).toBe("boom");
		expect(store.isGenerating).toBe(false);
		expect(subscriber).toHaveBeenCalledTimes(2);
	});
});
