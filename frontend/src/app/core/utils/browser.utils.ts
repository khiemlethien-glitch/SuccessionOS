/**
 * SSR-safe browser utilities.
 *
 * Mọi truy cập vào window / localStorage / sessionStorage / document
 * phải đi qua các hàm này để tránh crash khi Angular render trên server
 * (hydration mismatch → "Cannot read properties of null").
 */

export const isBrowser = (): boolean =>
  typeof window !== 'undefined';

// ─── localStorage ────────────────────────────────────────────────────────────

export const safeLocalStorage = {
  getItem: (key: string): string | null =>
    isBrowser() ? localStorage.getItem(key) : null,

  setItem: (key: string, value: string): void => {
    if (isBrowser()) localStorage.setItem(key, value);
  },

  removeItem: (key: string): void => {
    if (isBrowser()) localStorage.removeItem(key);
  },

  clear: (): void => {
    if (isBrowser()) localStorage.clear();
  },
};

// ─── sessionStorage ──────────────────────────────────────────────────────────

export const safeSessionStorage = {
  getItem: (key: string): string | null =>
    isBrowser() ? sessionStorage.getItem(key) : null,

  setItem: (key: string, value: string): void => {
    if (isBrowser()) sessionStorage.setItem(key, value);
  },

  removeItem: (key: string): void => {
    if (isBrowser()) sessionStorage.removeItem(key);
  },

  clear: (): void => {
    if (isBrowser()) sessionStorage.clear();
  },
};

// ─── window ──────────────────────────────────────────────────────────────────

/**
 * Redirect an toàn — không làm gì khi chạy trên server.
 */
export const safeNavigateTo = (url: string): void => {
  if (isBrowser()) {
    window.location.href = url;
  }
};

/**
 * Đọc window.location.search an toàn.
 * Trả về '' khi SSR.
 */
export const safeLocationSearch = (): string =>
  isBrowser() ? window.location.search : '';
