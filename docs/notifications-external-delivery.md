# Notifications — Phase 2: External delivery (email / WhatsApp / push)

Phase 1 (in-app notification center) is built: the `notifications` table is the
single source of truth, generated client-side and shown via the bell.

External delivery means **sending those notifications outside the app**. The
browser can't do that — it needs a server (a Supabase **Edge Function**) plus a
provider, and a **schedule** so alerts fire even when nobody has the app open.
None of this can be deployed from the app code; it requires your Supabase
project access + provider accounts. This runbook lists every step.

---

## Architecture

```
pg_cron (every N min)
   └─► SQL function generate_notifications()      -- inserts rows server-side
          └─► notifications table  (+ a deliveries log)
                 └─► Edge Function: dispatch-notifications
                        ├─► Email  (Resend / SendGrid)
                        ├─► WhatsApp (Meta Cloud API / Twilio)
                        └─► Web Push (VAPID)
```

Two pieces are needed beyond Phase 1:
1. **Server-side generation** — so notifications exist without the app open.
   (Phase 1 generates them only when staff open the app.)
2. **A dispatcher** — reads undelivered notifications and sends them.

---

## One-time schema add (delivery tracking)

So we never send the same alert twice, add a deliveries log:

```sql
create table if not exists notification_deliveries (
  notification_id uuid not null references notifications(id) on delete cascade,
  channel text not null,                 -- 'email' | 'whatsapp' | 'push'
  sent_at timestamptz not null default now(),
  status text not null default 'sent',
  primary key (notification_id, channel)
);
```

---

## Channel 1 — Email (recommended first; no approval needed)

1. Create a **Resend** account (resend.com), verify your sending domain, create an API key.
2. Decide recipients: a staff distribution list, or per-user emails from `profiles.email`.
3. Create the Edge Function:
   ```bash
   supabase functions new dispatch-notifications
   ```
   In `index.ts`: query `notifications` left-joined to `notification_deliveries`
   where `channel='email'` is missing, send each via Resend's API
   (`POST https://api.resend.com/emails` with `Authorization: Bearer ${RESEND_API_KEY}`),
   then insert a `notification_deliveries` row. Use the **service-role key**
   (available as an env var inside Edge Functions) so it can read all rows.
4. Set the secret and deploy:
   ```bash
   supabase secrets set RESEND_API_KEY=...
   supabase functions deploy dispatch-notifications
   ```
5. Schedule it (pg_cron + pg_net, in the SQL editor):
   ```sql
   select cron.schedule(
     'dispatch-notifications', '*/10 * * * *',
     $$ select net.http_post(
          url := 'https://<PROJECT-REF>.functions.supabase.co/dispatch-notifications',
          headers := jsonb_build_object('Authorization', 'Bearer <ANON-OR-CRON-SECRET>')
        ); $$
   );
   ```

## Channel 2 — WhatsApp (highest reach, but gated)

- Needs a **Meta WhatsApp Business** account + a verified business + **pre-approved
  message templates** (Meta review takes days), or a **Twilio** WhatsApp sender.
- Both cost per message and require opt-in for customer messaging.
- Same dispatcher pattern, calling the Cloud API / Twilio instead of Resend,
  with `channel='whatsapp'` in the deliveries log.
- Customer-facing reminders (e.g. "advance due") must use an approved template.

## Channel 3 — Web push (free, staff devices)

- Generate **VAPID** keys; add a **service worker** + PWA manifest to the Vite app.
- Store push subscriptions per user (a `push_subscriptions` table).
- The dispatcher sends via the Web Push protocol (e.g. the `web-push` library).
- Only works on devices where staff granted notification permission.

---

## Server-side generation (so alerts fire when the app is closed)

Port the Phase 1 generation logic (in `src/stores/notifications.ts`) into a
Postgres function and schedule it:

```sql
-- generate_notifications(): same dedupe_key upserts as the client does,
-- driven off bookings_advance_forecast / bookings_payment_status / enquiries.
select cron.schedule('generate-notifications', '0 * * * *',
  $$ select generate_notifications(); $$);
```

Once this exists, the client-side `generate()` can be removed (or kept as a
fast path when staff open the app).

---

## What I need from you to build this

- Which channel(s) to start with (email is easiest).
- Provider account(s) + API keys (Resend / Meta or Twilio / VAPID).
- Either: your `supabase` CLI access to deploy the Edge Function, **or** add me
  to the project so I can deploy it. (I can write all the function + SQL code now;
  I just can't deploy or hold secrets from this environment.)
