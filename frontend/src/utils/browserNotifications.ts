/**
 * Браузерные уведомления (Web Notifications API).
 *
 * Показывают системный пуш о новых сообщениях и заявках, пока вкладка
 * DentaFlow открыта (в т.ч. свёрнута/в фоне). Полноценный Web Push с
 * service worker (работающий при закрытом браузере) — отдельная большая
 * задача; здесь реализованы уведомления уровня открытой вкладки, чего
 * достаточно для оператора с открытой панелью.
 */

export function browserNotificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Запросить разрешение один раз (тихо игнорируем отказ). */
export async function requestNotificationPermission(): Promise<void> {
  if (!browserNotificationsSupported()) return;
  try {
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
  } catch {
    /* пользователь отклонил или API недоступно — не мешаем работе */
  }
}

interface ShowOptions {
  title: string;
  body?: string;
  /** Ссылка внутри приложения — по клику откроем её. */
  link?: string;
  /** Группировка: пуши с одним tag заменяют друг друга, а не копятся. */
  tag?: string;
}

/**
 * Показать браузерный пуш. По клику фокусирует вкладку и переходит по ссылке.
 * Возвращает true, если уведомление показано.
 */
export function showBrowserNotification({ title, body, link, tag }: ShowOptions): boolean {
  if (!browserNotificationsSupported() || Notification.permission !== "granted") {
    return false;
  }
  try {
    const notification = new Notification(title, {
      body: body || undefined,
      tag: tag || undefined,
    });
    notification.onclick = () => {
      window.focus();
      if (link) {
        // SPA-навигация без полной перезагрузки: меняем URL и уведомляем роутер.
        try {
          window.history.pushState({}, "", link);
          window.dispatchEvent(new PopStateEvent("popstate"));
        } catch {
          window.location.href = link;
        }
      }
      notification.close();
    };
    return true;
  } catch {
    return false;
  }
}
