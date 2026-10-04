// Delivers pending alerts as push notifications through the Expo push service.
//
// Called every minute by pg_cron when alerts are pending (with the shared CRON_SECRET), and by the
// app right after it syncs new entries (with the user's session) so urgent alerts go out at once.
// Safe to call often: claim_pending_alerts hands each alert to exactly one run.
// Deploy with --no-verify-jwt: the check below accepts either kind of caller.

import { createClient } from '@supabase/supabase-js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type Alert = { id: string; older_adult_id: string; level: 'alert' | 'watch' | 'info'; title: string };
type Recipient = { token: string; user_id: string };
type ExpoTicket = { status: 'ok' | 'error'; details?: { error?: string } };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const cronSecret = Deno.env.get('CRON_SECRET');
  const fromCron = !!cronSecret && req.headers.get('x-cron-secret') === cronSecret;
  if (!fromCron) {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: user } = token ? await admin.auth.getUser(token) : { data: { user: null } };
    if (!user?.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }

  const { data: alerts, error } = await admin.rpc('claim_pending_alerts', { p_limit: 100 });
  if (error) {
    console.error('claim_pending_alerts failed', error);
    return new Response(JSON.stringify({ error: 'claim failed' }), { status: 500, headers: corsHeaders });
  }

  const claimed = (alerts ?? []) as Alert[];
  if (claimed.length === 0) return new Response(JSON.stringify({ sent: 0 }), { headers: corsHeaders });

  const ids = [...new Set(claimed.map((a) => a.older_adult_id))];
  const { data: people } = await admin.from('older_adults').select('id, nickname').in('id', ids);
  const names = new Map((people ?? []).map((p: { id: string; nickname: string }) => [p.id, p.nickname]));

  // Lock-screen friendly: the person's name and what happened, never the measured values.
  const messages: { to: string; title: string; body: string; sound: 'default'; priority: 'high' | 'default'; data: Record<string, string> }[] = [];
  for (const alert of claimed) {
    const { data: recipients, error: rError } = await admin.rpc('alert_recipients', { p_alert_id: alert.id });
    if (rError) {
      console.error('alert_recipients failed', alert.id, rError);
      continue;
    }
    for (const r of (recipients ?? []) as Recipient[]) {
      messages.push({
        to: r.token,
        title: names.get(alert.older_adult_id) ?? 'Norita',
        body: alert.title,
        sound: 'default',
        priority: alert.level === 'alert' ? 'high' : 'default',
        data: { alertId: alert.id, olderAdultId: alert.older_adult_id },
      });
    }
  }

  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk),
      });
      const body = (await res.json()) as { data?: ExpoTicket[] };
      const tickets = body.data ?? [];
      tickets.forEach((ticket) => {
        if (ticket.status === 'ok') sent++;
        else console.warn('Push failed', ticket.details?.error);
      });
      // Remove devices that uninstalled the app or revoked notifications.
      const dead = tickets.flatMap((t, j) => (t.details?.error === 'DeviceNotRegistered' ? [chunk[j].to] : []));
      if (dead.length) await admin.from('push_tokens').delete().in('token', dead);
    } catch (e) {
      console.error('Expo push request failed', e);
    }
  }

  return new Response(JSON.stringify({ alerts: claimed.length, sent }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
