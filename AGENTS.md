# Yuzu UI — Frontend Agent Guide

Operating principles and component architecture for the `yuzu-ui` client codebase.

## 🎨 Frontend Stack & Boundaries

- **Runtime:** Vite, Vanilla ES Modules, CSS custom properties.
- **Backend Boundary:** All API calls route through `src/modules/apiFetch.js` pointing to the versioned `/v1/*` backend facade.
- **State Management:** `src/modules/store.js` owns client-side message state; `src/modules/store-renderer.js` handles DOM reconciliation.
- **Tool Rendering:** Tool output cards are formatted dynamically via the component registry in `src/modules/tool-renderer/`.

## 🛡️ Frontend Invariants

1. **Decoupled API Only:** Never import or execute backend logic directly in the UI.
2. **Zero Database Exposure:** The frontend never connects to PostgreSQL or persists secrets.
3. **No Raw Markdown in Tool Results:** Tool card rendering is strictly JSON-driven.
4. **Auth Gating:** Protect views using `bootApp()` with `redirectOnUnauthorized: true`.

## 🧪 Validation

```bash
bunx @biomejs/biome check src/
bun run build
```
