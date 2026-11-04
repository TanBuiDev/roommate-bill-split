# O Ghep — rate limits and resource protection

## Server-side controls

The SQL file security/resource-guardrails.sql is the reviewed migration for the existing Supabase project. It preserves all existing apartment, payment and billing data.

| Operation | Server-enforced successful-write quota |
| --- | --- |
| Create apartment | 3 per UTC 24h bucket/account, max 5 owned |
| Invite resident | 5 per hour/apartment, 10 per hour/account |
| Create resident | 100 per day/apartment, max 70 residents |
| Save monthly bill/legacy bill | 10 per minute/account |
| Save custom bill type | 30 per day/account, max 30 types/apartment |
| Fee-period payload | Max 30 fee lines and 1MB JSON |

Quotas are in an unexposed app_private table with RLS and revoked browser-role permissions. Transactional fixed-window counters are race-safe for successful mutations. Failed transactions roll back the counter and therefore are NOT counted; this is NOT a universal HTTP flood limit. Identical monthly save retries return the existing period ID, keeping previously confirmed payment statuses.

We checked 13 intentional SECURITY DEFINER RPCs; do not revoke authenticated access without examining their per-apartment owner/member checks. The checked RPCs already deny anonymous EXECUTE.

## Cloudflare Turnstile: activation requires a Supabase Auth secret

The connected Cloudflare account now has an invisible Turnstile widget for oghep.pages.dev, public sitekey 0x4AAAAAAFzzVZBEpyH7q3YR. The browser frontend obtains captchaToken only for outbound OTP email operations: user login AND owner invitation emails.

**Important: client tokens are not meaningful protection without Supabase server-side verification.** The available Supabase management connector cannot update Auth bot protection settings. The project owner must:

1. Open Supabase Dashboard for project loovjgylbookhouxjkaf, go to Authentication → Settings → Bot and Abuse Protection.
2. In Cloudflare Turnstile dashboard, open the matching widget and obtain its private SECRET (do NOT put the secret into ChatGPT, the repo, or static JS).
3. Enable Turnstile as the CAPTCHA provider in Supabase Auth and enter the private Secret there.
4. Verify sign-in and invitations in desktop, mobile and incognito. If the flow fails, temporarily disable the Supabase CAPTCHA toggle while debugging.

Until this setting is saved, Turnstile tokens are generated but **not enforced by Supabase**. Supabase Auth's built-in OTP rate limits and frontend cooldown still apply.

Docs: https://supabase.com/docs/guides/auth/auth-captcha and https://developers.cloudflare.com/turnstile/get-started/

## Cloudflare WAF

Cloudflare currently hosts only oghep.pages.dev and has no managed custom-domain Zone. Standard Zone WAF rules and Zone rate limiting are not applicable yet. Browser API traffic goes directly to Supabase, so static-site WAF would not rate-limit Supabase API anyway. Do not add a billable Worker/API proxy until actual abuse metrics warrant it.

The _headers file hardens Pages static responses (nosniff, deny iframing, referrer restrictions, Permissions Policy) and deploy-version.json disables caching. Avoid a restrictive script-source CSP until the external Supabase ESM and Cloudflare CAPTCHA scripts have been smoke-tested.

## GitHub Actions

PR tests automatically cancel obsolete PR test runs. Main deploys are serialized and skip superseded commits. README-only pushes do not build or deploy; changing tests/security files runs validation but skips public site deployment. Production packaging copies only public assets and confirms the deployed main commit.

## Monitoring and maintenance

Watch Supabase API logs, Auth 429s, database size and slow queries; monitor Cloudflare Pages deployment failures and GitHub workflow runs. Use warnings around 70% and 90% of actual plan quotas, but this repo has no notification delivery integration yet. The quota table grows slowly; periodically delete obsolete historical buckets using an audited maintenance process, not a continuous background job.
