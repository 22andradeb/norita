import type { Warning } from './insights';
import { supabase } from './supabase';
import type { IconName } from './vitals';

// Alerts raised on the server (see supabase/migrations/*_alerts.sql) and their acknowledgement.

export type AlertItem = {
  id: string;
  older_adult_id: string;
  kind: string;
  level: 'alert' | 'watch' | 'info';
  title: string;
  detail: string | null;
  created_at: string;
  created_by_name: string | null;
  acknowledged_by: string | null;
  acknowledged_by_name: string | null;
  acknowledged_at: string | null;
  ack_note: string | null;
};

export const ALERT_ICONS: Record<string, IconName> = {
  fall: 'alert-octagon-outline',
  urgent_event: 'alert-circle-outline',
  concern_event: 'eye-outline',
  missed_dose: 'pill',
  dose_not_logged: 'clock-alert-outline',
  low_stock: 'package-variant-closed',
  vital_out_of_range: 'heart-pulse',
  vital_unusual: 'chart-bell-curve-cumulative',
  confusion: 'head-question-outline',
  little_sleep: 'weather-night',
  exam_abnormal: 'file-document-outline',
  no_entries: 'calendar-remove-outline',
  no_check_in: 'clipboard-alert-outline',
  low_fluids: 'cup-water',
  few_meals: 'silverware-fork-knife',
  no_bowel: 'toilet',
  who5_low: 'emoticon-sad-outline',
  who5_drop: 'trending-down',
  frailty_screen: 'human-cane',
  frailty_worse: 'human-cane',
  who5_due: 'clipboard-pulse-outline',
  frail_due: 'clipboard-pulse-outline',
  appointment_tomorrow: 'calendar-clock',
};

/** Quick replies when marking an alert as seen. */
export const ACK_NOTES = ['Lo he visto', 'Me encargo', 'Llamaré al médico', 'Todo bien, falsa alarma'];

export async function listAlerts(olderAdultId: string, days = 14) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('alert_feed')
    .select('id, older_adult_id, kind, level, title, detail, created_at, created_by_name, acknowledged_by, acknowledged_by_name, acknowledged_at, ack_note')
    .eq('older_adult_id', olderAdultId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as AlertItem[];
}

export async function acknowledgeAlert(id: string, userId: string, note: string) {
  const { error } = await supabase
    .from('alerts')
    .update({ acknowledged_by: userId, acknowledged_at: new Date().toISOString(), ack_note: note })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** Asks the server to deliver any pending alerts now (e.g. right after a fall was synced). */
export function nudgeDelivery() {
  void supabase.functions.invoke('send-alerts', { body: {} }).catch(() => {});
}

/** Unacknowledged alerts from the last week, in the shape the status card uses. */
export function openAlerts(alerts: AlertItem[]) {
  const weekAgo = Date.now() - 7 * 86_400_000;
  return alerts.filter((a) => !a.acknowledged_at && Date.parse(a.created_at) >= weekAgo);
}

export const asWarnings = (alerts: AlertItem[]): Warning[] =>
  alerts.map((a) => ({ level: a.level, icon: ALERT_ICONS[a.kind] ?? 'bell-outline', title: a.title, detail: a.detail ?? undefined }));
