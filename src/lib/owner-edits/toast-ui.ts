import { clearToast, toast, type ToastState } from "./toast-store";

const TOAST_MS = 3500;

let hideTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Bind a toast host element to the shared toast atom.
 * Host should have `[data-owner-toast]` and optional `[data-owner-toast-message]`.
 */
export function bindToastHost(host: HTMLElement): () => void {
	const messageEl =
		host.querySelector<HTMLElement>("[data-owner-toast-message]") ?? host;

	const apply = (state: ToastState) => {
		if (hideTimer) {
			clearTimeout(hideTimer);
			hideTimer = null;
		}
		if (!state) {
			host.hidden = true;
			host.removeAttribute("data-toast-type");
			messageEl.textContent = "";
			return;
		}
		host.hidden = false;
		host.dataset.toastType = state.type;
		messageEl.textContent = state.message;
		hideTimer = setTimeout(() => {
			clearToast();
		}, TOAST_MS);
	};

	apply(toast.get());
	const unsub = toast.subscribe(apply);
	return () => {
		unsub();
		if (hideTimer) clearTimeout(hideTimer);
	};
}
