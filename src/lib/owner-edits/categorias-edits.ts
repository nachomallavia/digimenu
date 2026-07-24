import { map } from "nanostores";
import {
	pendingCount,
	removeId,
	setField,
	type PatchValue,
} from "./pending-map";

export type CategoriaPatch = {
	label?: string;
	icon?: string | null;
	removeCover?: boolean;
	coverFile?: boolean;
};

export type CategoriaField = keyof CategoriaPatch;

/** Pending field patches keyed by category slug. */
export const pending = map<Record<string, CategoriaPatch>>({});

/**
 * Cover preview URLs keyed by slug.
 * - missing key: use original `data-original-cover-src`
 * - string: object URL for a newly selected file
 * - null: cover removed (remove_cover)
 */
export const coverPreviewUrl = map<Record<string, string | null>>({});

export const categoriasPendingCount = pendingCount(pending);

export function isCategoriaDirty(slug: string): boolean {
	return Boolean(pending.get()[slug]);
}

export function setCategoriaField(
	slug: string,
	field: CategoriaField,
	value: CategoriaPatch[CategoriaField],
	original: PatchValue | undefined,
): void {
	setField(pending, slug, field, value, original);
}

export function setCoverPreview(slug: string, url: string | null): void {
	const prev = coverPreviewUrl.get()[slug];
	if (typeof prev === "string" && prev !== url) {
		URL.revokeObjectURL(prev);
	}
	coverPreviewUrl.set({ ...coverPreviewUrl.get(), [slug]: url });
}

export function clearCoverPreview(slug: string): void {
	const prev = coverPreviewUrl.get()[slug];
	if (typeof prev === "string") {
		URL.revokeObjectURL(prev);
	}
	const next = { ...coverPreviewUrl.get() };
	delete next[slug];
	coverPreviewUrl.set(next);
}

export function discardCategoria(slug: string): void {
	removeId(pending, slug);
	clearCoverPreview(slug);
}

export function markCategoriaSaved(slug: string): void {
	discardCategoria(slug);
}
