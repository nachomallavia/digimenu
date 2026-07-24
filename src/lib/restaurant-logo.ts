import type { ThemeMode } from "./restaurant-theme";

export type RestaurantLogos<T = unknown> = {
	logo_light?: T;
	logo_dark?: T;
};

/**
 * Logo for the active theme mode. If only one logo exists, use it for both.
 */
export function restaurantLogoForMode<T>(
	data: RestaurantLogos<T>,
	mode: ThemeMode,
): T | undefined {
	const preferred = mode === "dark" ? data.logo_dark : data.logo_light;
	const fallback = mode === "dark" ? data.logo_light : data.logo_dark;
	return preferred ?? fallback ?? undefined;
}

/** Which field slug is actively shown (for visual edit attrs). */
export function restaurantLogoFieldForMode(
	data: RestaurantLogos,
	mode: ThemeMode,
): "logo_light" | "logo_dark" | null {
	const preferred = mode === "dark" ? data.logo_dark : data.logo_light;
	const fallback = mode === "dark" ? data.logo_light : data.logo_dark;
	if (preferred) return mode === "dark" ? "logo_dark" : "logo_light";
	if (fallback) return mode === "dark" ? "logo_light" : "logo_dark";
	return null;
}
