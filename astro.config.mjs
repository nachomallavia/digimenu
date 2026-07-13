import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { fileURLToPath } from "node:url";
import { digimenuAutofillPlugin } from "./src/plugins/digimenu-autofill/index.ts";

export default defineConfig({
	output: "server",
	adapter: cloudflare(),
	prefetch: {
		prefetchAll: false,
		defaultStrategy: "hover",
	},
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		emdash({
			database: d1({ binding: "DB", session: "auto" }),
			storage: r2({ binding: "MEDIA" }),
			plugins: [digimenuAutofillPlugin()],
		}),
	],
	devToolbar: { enabled: false },
	vite: {
		// Prefer PostCSS (@tailwindcss/postcss) over @tailwindcss/vite.
		// The Vite plugin empties /_emdash/admin SSR HTML in this EmDash +
		// Cloudflare Workers setup (200 with 0-byte body).
		resolve: {
			alias: {
				"@": fileURLToPath(new URL("./src", import.meta.url)),
			},
		},
	},
});
