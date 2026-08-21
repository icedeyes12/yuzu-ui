// FILE: static/js/modules/skeleton.js
// DESCRIPTION: Skeleton loading UI components

/**
 * Show skeleton loading state in chat container.
 */
export function showChatSkeleton() {
	const chatContainer = document.getElementById("chatContainer");
	if (!chatContainer) return;
	// If already showing skeleton, do not recreate
	if (document.getElementById("chatSkeletonContainer")) return;

	// Clear container before mounting skeleton on session switch
	chatContainer.innerHTML = "";

	const skeletonDiv = document.createElement("div");
	skeletonDiv.id = "chatSkeletonContainer";
	skeletonDiv.className = "skeleton-chat-container";
	skeletonDiv.innerHTML = `
		<div class="skeleton-message ai">
			<div class="skeleton skeleton-message-line long"></div>
			<div class="skeleton skeleton-message-line medium"></div>
			<div class="skeleton skeleton-message-line short"></div>
		</div>
		<div class="skeleton-message user">
			<div class="skeleton skeleton-message-line medium"></div>
			<div class="skeleton skeleton-message-line short"></div>
		</div>
		<div class="skeleton-message ai">
			<div class="skeleton skeleton-message-line long"></div>
			<div class="skeleton skeleton-message-line medium"></div>
		</div>
	`;
	chatContainer.appendChild(skeletonDiv);
}

/**
 * Hide skeleton and prepare for real content.
 */
export function hideChatSkeleton() {
	const skeletonDiv = document.getElementById("chatSkeletonContainer");
	if (skeletonDiv) {
		skeletonDiv.remove();
	}
}
