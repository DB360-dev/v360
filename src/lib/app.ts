/** Product name shown to brands. Set VITE_APP_NAME in .env to rebrand. */
export const APP_NAME: string = (import.meta.env.VITE_APP_NAME as string | undefined)?.trim() || "Brand Portal";
export const APP_INITIAL = APP_NAME.charAt(0).toUpperCase();
