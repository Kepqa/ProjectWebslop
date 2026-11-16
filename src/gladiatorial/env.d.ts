/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STARS_SUBSCRIPTION_LINK?: string;
  readonly VITE_STARS_BOX_LINK?: string;
}

interface TelegramWebApp {
  ready(): void;
  expand(): void;
  disableVerticalSwipes(): void;
  openInvoice?(url: string, callback?: (status: string) => void): void;
  initData: string;
  initDataUnsafe?: {
    user?: {
      first_name?: string;
      username?: string;
    };
  };
  themeParams?: {
    bg_color?: string;
  };
}

interface Window {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
}
