import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { supabase } from './supabase';

// Push notifications: register this phone with the Expo push service and store its token so the
// `send-alerts` edge function can reach it.

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type PushStatus = 'enabled' | 'denied' | 'unavailable' | 'not_configured' | 'error';

let currentToken: string | null = null;

function projectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/** Registers this phone for push. `ask` shows the permission prompt if it hasn't been answered. */
export async function registerForPush(ask: boolean): Promise<PushStatus> {
  if (!Device.isDevice) return 'unavailable';
  const id = projectId();
  if (!id) return 'not_configured';

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && ask) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return 'denied';

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Avisos',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
    const { error } = await supabase.rpc('register_push_token', {
      p_token: token,
      p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    if (error) throw new Error(error.message);
    currentToken = token;
    return 'enabled';
  } catch (e) {
    console.warn('Push registration failed', e);
    return 'error';
  }
}

/** Stops notifications to this phone for the user who is signing out. */
export async function forgetPushToken() {
  if (!currentToken) return;
  await supabase.rpc('unregister_push_token', { p_token: currentToken });
  currentToken = null;
}

/**
 * Registers once the user is fully signed in, and calls `onOpen` with the person an alert is
 * about when a notification is tapped (also when the tap launched the app).
 */
export function usePushNotifications(userId: string | undefined, onOpen: (olderAdultId: string | undefined) => void) {
  useEffect(() => {
    if (userId) void registerForPush(true);
  }, [userId]);

  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!last || !userId) return;
    const data = last.notification.request.content.data as { olderAdultId?: string } | undefined;
    onOpen(data?.olderAdultId);
    // Only react to new taps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last, userId]);
}
