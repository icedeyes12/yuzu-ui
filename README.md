# Yuzu UI ฅ^•ﻌ•^ฅ

> Modern Vanilla JS SPA built with Vite for Yuzu Companion, deployed at the Cloudflare Edge.

[![Cloudflare](https://img.shields.io/badge/Deployed-Cloudflare%20Edge-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://chat.yuzuki.space)
[![Vite](https://img.shields.io/badge/Vite-7.3%2B-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
[![Biome](https://img.shields.io/badge/Linter-Biome-60A5FA?style=for-the-badge&logo=biome&logoColor=white)](https://biomejs.dev)

---

## 🎨 Overview & Features

- **Decoupled Architecture**: Communicates exclusively with the backend via REST & SSE streaming under `/v1/*`.
- **Zero-Flash Auth Gate**: Secure DOM rendering with immediate redirect to login when unauthorized.
- **Dynamic Theming**: Instant theme switching without FOUC (Flash of Unstyled Content).
- **Component Registry**: Custom client-side tool renderer for terminal cards, weather widgets, and markdown blocks.

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
bun install

# 2. Start local development server
bun run dev

# 3. Build for production
bun run build

# 4. Deploy to Cloudflare
bun run deploy
```

---

## 🧪 Validation & Linting

```bash
bunx @biomejs/biome check src/
```
