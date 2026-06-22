import webpush from 'web-push';
import { prisma } from '../../config/prismaClient.js';
import { env } from '../../config/env.js';

// Configure VAPID details
if (env.vapidPublicKey && env.vapidPrivateKey) {
  webpush.setVapidDetails(
    'mailto:' + env.vapidEmail,
    env.vapidPublicKey,
    env.vapidPrivateKey
  );
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: {
    url?: string;
    action?: string;
    [key: string]: any;
  };
}

/**
 * Envía notificaciones push a usuarios con un rol específico
 */
export async function sendPushToRole(
  rol: string,
  payload: PushNotificationPayload
): Promise<void> {
  try {
    // Obtener usuarios con el rol especificado que tengan suscripciones push
    const users = await prisma.user.findMany({
      where: {
        rol: {
          equals: rol,
          mode: 'insensitive',
        },
        estado: 'activo',
        pushSubscriptions: {
          some: {},
        },
      },
      include: {
        pushSubscriptions: true,
      },
    });

    console.log(`[Push Notification] Sending to ${users.length} users with rol "${rol}"`);

    const pushPayload = JSON.stringify(payload);

    for (const user of users) {
      for (const sub of user.pushSubscriptions) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            pushPayload
          );
          console.log(`[Push Notification] Sent to ${user.nombre} (${user.email})`);
        } catch (pushErr: any) {
          console.error(`[Push Notification Error] Failed for ${sub.endpoint}:`, pushErr.message);
          
          // Si el endpoint ya no es válido, eliminarlo
          if (pushErr.statusCode === 404 || pushErr.statusCode === 410) {
            await prisma.pushSubscription.delete({
              where: { endpoint: sub.endpoint },
            }).catch(() => {});
          }
        }
      }
    }
  } catch (error) {
    console.error('[Push Notification Service] Error:', error);
    throw error;
  }
}

/**
 * Envía notificaciones push a usuarios específicos por sus IDs
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushNotificationPayload
): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      where: {
        id: { in: userIds },
        estado: 'activo',
        pushSubscriptions: {
          some: {},
        },
      },
      include: {
        pushSubscriptions: true,
      },
    });

    const pushPayload = JSON.stringify(payload);

    for (const user of users) {
      for (const sub of user.pushSubscriptions) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            pushPayload
          );
        } catch (pushErr: any) {
          console.error(`[Push Notification Error] Failed for ${sub.endpoint}:`, pushErr.message);
          
          if (pushErr.statusCode === 404 || pushErr.statusCode === 410) {
            await prisma.pushSubscription.delete({
              where: { endpoint: sub.endpoint },
            }).catch(() => {});
          }
        }
      }
    }
  } catch (error) {
    console.error('[Push Notification Service] Error:', error);
    throw error;
  }
}
