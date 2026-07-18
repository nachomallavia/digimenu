import { atom } from "nanostores";

export type ToastState = {
	type: "success" | "error";
	message: string;
} | null;

export const toast = atom<ToastState>(null);

export function showToast(type: "success" | "error", message: string): void {
	toast.set({ type, message });
}

export function clearToast(): void {
	toast.set(null);
}
