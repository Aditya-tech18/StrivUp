/**
 * src/lib/strivy/push/sender.ts
 *
 * Delivers one payload to one browser subscription.
 *
 *  - webPushSender: real Web Push (VAPID-signed, encrypted) via the web-push
 *    library. A 404 or 410 from the push service means the subscription is
 *    gone; the scheduler then deletes it.
 *  - createMemorySender: records payloads, for tests.
 */
import webpush from "web-push";
import { safeClickUrl } from "./config";
import { categorizeSendStatus, type PushErrorCategory } from "./diagnostics";
import type { PushSubscriptionRecord } from "./store";

export interface PushPayload {
  title: string;
  body: string;
  /** Same-site path the notification opens. */
  url: string;
  /** Replaces an older notification with the same tag instead of stacking. */
  tag: string;
}

export type SendResult =
  | { ok: true }
  | {
      ok: false;
      gone: boolean;
      error: string;
      /** invalid_subscription, vapid_mismatch or send_failed (see diagnostics.ts). */
      category?: PushErrorCategory;
    };

export interface PushSender {
  send(sub: PushSubscriptionRecord, payload: PushPayload): Promise<SendResult>;
}

/** What the service worker receives. Only these fields, nothing else. */
export function serializePayload(p: PushPayload): string {
  return JSON.stringify({
    title: p.title.slice(0, 60),
    body: p.body.slice(0, 200),
    url: safeClickUrl(p.url),
    tag: p.tag.slice(0, 120),
  });
}

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function vapidFromEnv(): VapidConfig | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

/** Web Push request options: VAPID-signed, kept for 4 hours if the device is offline. */
export function pushOptions(vapid: VapidConfig) {
  return {
    vapidDetails: vapid,
    TTL: 4 * 60 * 60,
    urgency: "normal" as const,
    timeout: 10_000,
  };
}

export function webPushSender(vapid: VapidConfig): PushSender {
  return {
    async send(sub, payload) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          serializePayload(payload),
          pushOptions(vapid)
        );
        return { ok: true };
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        return {
          ok: false,
          gone: status === 404 || status === 410,
          category: categorizeSendStatus(status),
          error: status
            ? `push service ${status}`
            : err instanceof Error
              ? err.message
              : "send failed",
        };
      }
    },
  };
}

export function createMemorySender(
  behaviour: (sub: PushSubscriptionRecord) => SendResult = () => ({ ok: true })
) {
  const sent: { sub: PushSubscriptionRecord; payload: PushPayload }[] = [];
  const sender: PushSender = {
    async send(sub, payload) {
      const result = behaviour(sub);
      if (result.ok) sent.push({ sub, payload });
      return result;
    },
  };
  return { sender, sent };
}
