# PRD 10 — Monetization (freemium → paid)

## Implementation evidence
- `student.subscription_tier` ('free' | 'unlimited_trial' | …),
  `subscription_source` ('app_store' | 'none' | …), `billing_interval`,
  `stripe_customer_id` (present on our test account: `cus_VGiQzXV0dFHL9t`).
- Entitlement failures are data: `not_enough_credits` flag on content rows —
  UI reads DB state to upsell, no hard API errors.
- Churn-save flows via Churnkey (`api.churnkey.co` config on every page).
- Mobile IAP (`app_store` source) alongside web Stripe — same tier field.

## Inkwell build
1. Schema: `users.subscription_tier text DEFAULT 'free'`,
   `subscription_source text`, `stripe_customer_id text`, `billing_interval text`.
2. Gating: one check in the shared generation entry point (PRD 1 pipeline):
   free tier = N docs/month + no podcast + no lesson; failures set
   `needs_upgrade=true` + `error_message` on the row (never a 500) so the UI
   shows the upsell state inline.
3. Stripe Checkout + webhook → update tier fields (scaffold exists from
   roadmap Phase 1 — finish it).
4. Pricing v1: free (5 docs/mo, no podcast/lesson) / Pro $20/mo (unlimited +
   all generators). One price, no A/B until traffic.
5. ponytail: skip Churnkey-style cancel flows, trials, coupons — add when we
   have churn to save.

## Acceptance criteria
- 6th doc in a month for a free user → readable upsell state; paying flips tier;
  podcast/lesson buttons gate on tier; all states verifiable in DB.

**Effort:** 4-5 days. **Skipped:** annual plan, coupons, churn-save, IAP — later.
