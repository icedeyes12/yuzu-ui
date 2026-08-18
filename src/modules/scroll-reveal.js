/**
 * Scroll-reveal for page sections, with reduced-motion and keyboard-focus
 * handling.
 *
 * Every element matching `selector` gets the `animate-on-scroll` class and is
 * revealed (via `is-visible`) once it intersects the viewport. Under
 * `prefers-reduced-motion` nothing is applied — the CSS override renders
 * sections fully visible instead.
 *
 * CSS contract (src/styles/components/scroll-reveal.css, linked by the
 * about and config pages):
 *   .animate-on-scroll { opacity: 0; transform: translateY(20px); transition: ...; }
 *   .animate-on-scroll.is-visible { opacity: 1; transform: translateY(0); }
 *   .animate-on-scroll:focus-within { opacity: 1; transform: translateY(0); }
 *   @media (prefers-reduced-motion: reduce) {
 *     .animate-on-scroll { opacity: 1; transform: none; transition: none; }
 *   }
 *
 * @param {string} selector - Selector for the sections to reveal.
 * @param {Object} [options] - IntersectionObserver tuning.
 * @param {number} [options.threshold=0.1]
 * @param {string} [options.rootMargin="0px 0px -50px 0px"]
 * @return {() => void} A disposer that stops observing and removes the
 *   focus listener.
 */
export function initScrollReveal(selector, options = {}) {
	// Under reduced motion, sections render fully visible via CSS — skip
	// the observer and hidden-state entirely.
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
		return () => {};
	}

	const { threshold = 0.1, rootMargin = "0px 0px -50px 0px" } = options;

	const observer = new IntersectionObserver(
		(entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					entry.target.classList.add("is-visible");
				}
			});
		},
		{ threshold, rootMargin },
	);

	const reveal = (section) => section.classList.add("is-visible");

	document.querySelectorAll(selector).forEach((section) => {
		section.classList.add("animate-on-scroll");
		observer.observe(section);
	});

	// Keyboard users tabbing into a not-yet-revealed section would focus an
	// invisible control — reveal that section permanently on focus.
	const handleFocusIn = (event) => {
		const section = event.target.closest(selector);
		if (section) reveal(section);
	};
	document.addEventListener("focusin", handleFocusIn);
	// Catch focus already inside a section (e.g. restored on reload).
	const activeSection = document.activeElement?.closest(selector);
	if (activeSection) reveal(activeSection);

	return () => {
		observer.disconnect();
		document.removeEventListener("focusin", handleFocusIn);
	};
}
