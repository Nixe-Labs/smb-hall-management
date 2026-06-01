# Roadmap — Native apps + white-label multi-tenancy

**Locked-in decisions** (from the planning conversation):

1. **Multi-tenancy goal:** white-label for specific clients. No public signup, no in-app billing. You onboard each new client manually.
2. **Sequencing:** native wrap first, multi-tenancy second.
3. **App-store positioning:** separate branded app per tenant (e.g. "SMB Hall", "XYZ Hall" as distinct App Store / Play Store listings, fed by a single backend).
4. **Tamil-context features:** per-tenant toggle in settings. Default on for SMB.

---

## Phase 1 · Capacitor wrap of SMB (1–2 weeks)

SMB ships to the App Store and Play Store *as-is, single-tenant*. No DB changes. The native shell wraps the current Vue codebase one-to-one.

**What changes:**
- Add Capacitor (`@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android`)
- Generate `ios/` and `android/` shells
- Suppress the Workbox service worker inside Capacitor builds (the native shell handles caching; SW + Capacitor fight over offline routing)
- Switch the Vue Router to `createWebHashHistory()` *only inside the Capacitor build* (web build stays on `createWebHistory` — keeps GH Pages working)
- Add `capacitor.config.json` with bundle id, splash, status-bar config

**Native plugins (only what we'll actually use):**
- `@capacitor/push-notifications` — FCM (Android) + APNs (iOS); replaces the in-app notifications channel for push delivery. Web continues to use the in-app bell.
- `@capacitor/biometric-auth` (Face ID / fingerprint) for the lock screen on app resume.
- `@capacitor/keyboard`, `@capacitor/status-bar` for UX polish.
- `@capacitor/camera` *deferred* — useful when we add receipt scanning later.

**Build pipeline:**
- `npm run build` → standard web (still publishable to GH Pages as the fallback URL)
- `npx cap sync ios` + Xcode → `.ipa`
- `npx cap sync android` + Android Studio → `.aab`

**App-store submission checklist:**
- Apple Developer Program ($99/yr) — Apple ID required, certificates + provisioning profiles
- Google Play Console ($25 one-time)
- Icons (1024×1024 master, generated to all sizes), splash screens, screenshots for 3 device sizes
- App descriptions, keywords, age rating, content rating
- Privacy policy URL (static page; host alongside the web app)
- First-submission review window: **1–3 weeks for Apple**, ~1–3 days for Google

**Deliverables at end of Phase 1:**
- SMB iOS app live on App Store
- SMB Android app live on Play Store
- Push notifications functioning for new bookings / advance reminders
- No backend changes; SMB users' data and login unchanged

---

## Phase 2 · Per-tenant Supabase projects (≈3 days)

**Architecture decision (revised):** one Supabase project per tenant. SMB stays exactly as it is today — zero schema changes, zero RLS rewrites, zero backfill, no maintenance window. The "second tenant" is a fresh Supabase project provisioned from the same migrations.

Why this beats shared-schema for white-label:
- Phase 1's per-tenant Capacitor build already needs to bake in a Supabase URL + anon key per tenant. That's exactly what one-project-per-tenant requires — so the build pipeline cost is identical.
- Physical isolation, not policy-level. Cross-tenant leak is impossible.
- SMB's existing RLS, queries, types, everything keeps working untouched.
- Tenants who need more capacity move to Supabase Pro independently; tenants who don't stay on Free.

What we build instead:

**A · Migration runner**
- Goal: apply the canonical `supabase/migrations/*.sql` files against any tenant project in one command.
- `scripts/migrate-tenant.ts <tenant-slug>` — reads `tenants/<slug>/supabase.json`, connects with the service-role key, applies migrations in order, records them in a tracking table.
- Same script used for SMB itself (replacing manual SQL Editor pastes going forward).

**B · Tenant provisioning script**
- `scripts/provision-tenant.ts <tenant-slug>` — calls the Supabase Management API to create a new project, then chains into the migration runner, then seeds default rows (standard bill categories, Cash on hand account, etc.).
- Takes ~2 minutes end-to-end per tenant.

**C · Per-tenant config file**
- `tenants/<slug>/config.json` (see Phase 3) gets two new fields per tenant: `supabase_url` and `supabase_anon_key`.
- `tenants/<slug>/.env.local` (gitignored) holds the service-role key for Nixe-side admin operations.

**D · Optional — Nixe internal admin dashboard**
- A tiny script (not a deployed app) that loops over all tenant projects with their service-role keys and prints a summary: bookings this month, revenue, active staff. Doesn't need to be built until you actually have 2+ tenants.

**What does NOT change:**
- Existing schema. Every table stays untouched.
- All current RLS policies (`is_admin()`, `is_staff_or_admin()`, etc.) keep working as-is.
- SMB's database. SMB ships in Phase 1 and never has to migrate.
- The Vue codebase. Every query already passes through `supabase` from `@/lib/supabase` — that client just needs its URL + anon key supplied at build time.

**Trade-offs you should know:**
- Schema changes require running the migration on every tenant's project. The runner makes this a single command per tenant, but it's still N commands. At <20 tenants this is fine; at >100 it'd warrant CI orchestration.
- "Show me revenue across all my clients" needs a separate script, not one query.
- Nixe holds the service-role keys for every tenant project — these are high-impact credentials that must live in a password manager.

---

## Phase 3 · White-label app build pipeline (1 week)

The single Vue codebase becomes a **template** that produces N differently-branded apps. Per-tenant config drives the build.

**`tenants/<slug>/config.json`** (one per tenant):

```json
{
  "slug": "smb",
  "organization_id": "uuid-from-DB",
  "app_name": "SMB Hall",
  "bundle_id": "com.nixe.smbhall",
  "android_package": "com.nixe.smbhall",
  "ios_app_store_id": "1234567890",
  "android_play_store_id": "com.nixe.smbhall",
  "brand_color_primary": "#1a1a1a",
  "brand_color_secondary": "#f4efe6",
  "tamil_context_default": true,
  "icon_master": "tenants/smb/icon-1024.png",
  "splash_master": "tenants/smb/splash.png"
}
```

**`npm run build:tenant smb`** does:
1. Reads `tenants/smb/config.json`
2. Injects `VITE_TENANT_*` env vars
3. Replaces `public/icon.svg`, splash, app name in `capacitor.config.json`
4. Sets `organization_id` constant in the app — login form pins to this tenant
5. Runs the standard Vite + Capacitor sync
6. Outputs `dist/smb/` + `ios-smb/` + `android-smb/` build artifacts

A tenant's app **cannot** access another tenant's data — the org_id is hard-coded at build time *and* enforced by RLS at the DB. Two layers.

**Onboarding a new client looks like:**
1. Get hall name, brand colors, logo from client
2. Add `tenants/xyz/config.json`
3. `INSERT INTO organizations` + seed default bill categories, expense categories, accounts
4. `npm run build:tenant xyz`
5. Submit to App Store / Play Store under whichever developer account owns the listing (see open decision below)
6. Send the client the install link + their admin login

---

## Phase 4 · Tenant onboarding tools (1–2 weeks)

Lightweight, internal-only. No public signup needed (per the white-label decision).

- **Admin tool / script** to create a new organization with default seed data
- **Invite flow** inside each white-label app: tenant admin invites staff/viewer users by email
- **Default seed per new tenant:** standard bill categories (Cleaning, Audio, Guest Rooms, Additional Kitchen), Cash on hand account, etc.
- **Tenant-scoped branding:** the per-tenant logo + colors render in the app sidebar, login, and the **PDF invoice template** so client invoices look like the client's brand, not yours

---

## Phase 5 · Polish

- **Per-tenant Tamil-context toggle** wired through the UI: hide Tamil calendar, demand pricing card, Tamil columns in reports when `org.tamil_context = false`
- **Per-tenant invoice template** (PDF header / footer / logo)
- **Per-tenant privacy policies** (app-store mandates one URL per app)
- **Help docs** — one universal doc + per-tenant branded landing page
- **Analytics:** Vercel/Plausible/PostHog per tenant or pooled with a tenant_id property

---

## Effort + critical-path summary

| Phase | Duration | Blocker |
|---|---|---|
| 1 — Capacitor wrap | 1–2 weeks (+ 1–3 weeks Apple review) | Apple Developer enrollment, asset production |
| 2 — Per-tenant Supabase tooling | **~3 days** | Supabase Management API token |
| 3 — White-label pipeline | 1 week | Phase 2 must be done |
| 4 — Tenant onboarding | 1 week | Phase 3 must be done |
| 5 — Polish | Ongoing | None — can iterate after first new tenant ships |

**Total elapsed time to "second tenant live on stores": ~4–5 weeks** (solo, excluding Apple's review queue). Down from the original 7–10 weeks because Phase 2 is now tooling, not a backend rewrite.

---

## Risks I'm tracking

- **Apple review for white-label apps.** Apple sometimes rejects white-label submissions as "spam clones" if the apps look near-identical. We mitigate by genuinely customising icon, name, splash, brand colors, and screenshots per tenant. May need to brief Apple via the review notes.
- **Service-role-key handling.** With one Supabase project per tenant, Nixe accumulates N service-role keys — each of which is god-mode for that tenant's data. They must live in a password manager (1Password / Bitwarden / similar) and *never* be checked in. Gitignored `tenants/<slug>/.env.local` for local Nixe-side scripts.
- **Schema-drift across tenants.** If a migration runs successfully on SMB but fails on XYZ (e.g. a tenant has older data the migration doesn't expect), tenants end up on different schema versions. The migration runner has to track applied migrations per tenant and refuse to proceed if a previous one failed.
- **Capacitor + service worker conflict.** Already noted; gated by an env var.
- **Per-tenant secrets baked into the app binary.** The anon key gets compiled into each Capacitor build. Anon keys are designed to be public (that's their purpose — RLS does the enforcement) but it's worth understanding that the binary is essentially a key carrier. Rotating an anon key means rebuilding + resubmitting that tenant's app.
- **App-store account economics.** See the open decision below.

---

## ❓ Open decision — needed before Phase 1 starts

**Who hosts the App Store / Play Store listings?**

For a white-label model with N tenants on the stores, there are three viable patterns. They have different implications for ownership, revenue, support, and what each tenant pays for.

| Pattern | What it looks like | Tenant pays | Nixe holds |
|---|---|---|---|
| **A) Nixe holds everything** | All apps published under one "Nixe Labs" developer account. Tenant sees their brand inside the app but the App Store says "Provided by Nixe Labs". | Flat monthly/annual fee to Nixe | Apple Dev account ($99/yr), Play account ($25), all certificates |
| **B) Tenant owns the listing** | Each tenant creates their own Apple Developer + Google Play accounts. Nixe builds the binaries; tenant uploads & owns the store presence. | Their own Apple/Play accounts + build fee to Nixe | Just the build pipeline |
| **C) Hybrid — Nixe iOS, tenant Android** | Apple's account costs $99/yr; Play is one-time $25. Nixe holds iOS (controls the costliest), tenant holds Android. | One-time Play account + flat fee | Apple Dev account, iOS certificates |

If you don't have a strong preference, I'd recommend **A** for the first 2–3 clients — fastest, smallest friction for them — and switch to **B** later if a client wants full ownership. Tell me which pattern, and I'll start Phase 1 with the right account setup notes.

---

## What I'll do once Phase 1 is greenlit

1. Add Capacitor and generate `ios/` + `android/` shells
2. Suppress the Workbox SW inside Capacitor builds
3. Wire up `@capacitor/push-notifications` against your existing notifications table
4. Write a per-asset script that converts a 1024×1024 master into all required icon sizes
5. Produce the SMB build for iOS + Android
6. Hand you the list of store assets to gather (screenshots, descriptions, privacy policy URL)
