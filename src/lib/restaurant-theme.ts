import { themeToStyle } from "./theme";

export type ThemeMode = "light" | "dark";
export type ThemeRadius = "none" | "sm" | "md" | "lg";

export type RestaurantTheme = {
	mode: ThemeMode;
	primary: string;
	background: string;
	foreground: string;
	muted: string;
	border: string;
	radius: ThemeRadius;
	fontDisplay: string;
	fontBody: string;
};

export const FONT_OPTIONS = [
	{ id: "system-sans", label: "System Sans", family: "ui-sans-serif, system-ui, sans-serif" },
	{ id: "system-serif", label: "System Serif", family: "ui-serif, Georgia, serif" },
	{
		id: "dm-sans",
		label: "DM Sans",
		family: '"DM Sans", ui-sans-serif, system-ui, sans-serif',
		google: "DM+Sans:wght@400;600;700",
	},
	{
		id: "source-serif",
		label: "Source Serif 4",
		family: '"Source Serif 4", ui-serif, Georgia, serif',
		google: "Source+Serif+4:wght@400;600;700",
	},
	{
		id: "fraunces",
		label: "Fraunces",
		family: '"Fraunces", ui-serif, Georgia, serif',
		google: "Fraunces:wght@500;700",
	},
] as const;

const RADIUS_MAP: Record<ThemeRadius, string> = {
	none: "0",
	sm: "0.25rem",
	md: "0.625rem",
	lg: "1rem",
};

export const DEFAULT_RESTAURANT_THEME: RestaurantTheme = {
	mode: "light",
	primary: "#1d4ed8",
	background: "#ffffff",
	foreground: "#0a0a0a",
	muted: "#737373",
	border: "#e5e5e5",
	radius: "md",
	fontDisplay: "system-sans",
	fontBody: "system-sans",
};

export function parseRestaurantTheme(raw: unknown): RestaurantTheme {
	if (!raw || typeof raw !== "object") return { ...DEFAULT_RESTAURANT_THEME };
	const o = raw as Record<string, unknown>;
	const mode: ThemeMode = o.mode === "dark" ? "dark" : "light";
	const radius =
		o.radius === "none" || o.radius === "sm" || o.radius === "lg" || o.radius === "md"
			? o.radius
			: "md";
	return {
		mode,
		primary: typeof o.primary === "string" ? o.primary : DEFAULT_RESTAURANT_THEME.primary,
		background:
			typeof o.background === "string" ? o.background : DEFAULT_RESTAURANT_THEME.background,
		foreground:
			typeof o.foreground === "string" ? o.foreground : DEFAULT_RESTAURANT_THEME.foreground,
		muted: typeof o.muted === "string" ? o.muted : DEFAULT_RESTAURANT_THEME.muted,
		border: typeof o.border === "string" ? o.border : DEFAULT_RESTAURANT_THEME.border,
		radius,
		fontDisplay:
			typeof o.fontDisplay === "string" ? o.fontDisplay : DEFAULT_RESTAURANT_THEME.fontDisplay,
		fontBody: typeof o.fontBody === "string" ? o.fontBody : DEFAULT_RESTAURANT_THEME.fontBody,
	};
}

function fontFamily(id: string): string {
	return FONT_OPTIONS.find((f) => f.id === id)?.family ?? FONT_OPTIONS[0].family;
}

export function restaurantThemeToCssVars(theme: RestaurantTheme): Record<string, string> {
	return {
		background: theme.background,
		foreground: theme.foreground,
		primary: theme.primary,
		"primary-foreground": "#fafafa",
		muted: theme.mode === "dark" ? "#262626" : "#f5f5f5",
		"muted-foreground": theme.muted,
		border: theme.border,
		card: theme.background,
		"card-foreground": theme.foreground,
		radius: RADIUS_MAP[theme.radius],
		"font-display": fontFamily(theme.fontDisplay),
		"font-body": fontFamily(theme.fontBody),
	};
}

export function restaurantThemeStyle(theme: RestaurantTheme): string | undefined {
	return themeToStyle(restaurantThemeToCssVars(theme));
}

export function googleFontsHref(theme: RestaurantTheme): string | null {
	const ids = new Set([theme.fontDisplay, theme.fontBody]);
	const families = FONT_OPTIONS.filter(
		(f) => ids.has(f.id) && "google" in f && typeof f.google === "string",
	).map((f) => ("google" in f ? f.google : null));
	if (families.length === 0) return null;
	return `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=swap`;
}
