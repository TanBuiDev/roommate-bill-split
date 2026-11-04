# Ở Ghép — shared apartment billing

A lightweight apartment billing app with a black-and-white Uber Bold Transit landing. All user-facing text in English; no public repository links in website navigation or footer.

## URLs and deployment

Production: https://oghep.pages.dev/

The production website is deployed to Cloudflare Pages through Direct Upload, **not** automatically on GitHub push. From the repository root, with the Cloudflare account signed in:

    export CLOUDFLARE_ACCOUNT_ID=37f44fbbb3a0e19e54a87ffa70802fb2
    npx wrangler pages deploy . --project-name oghep --branch main

The equivalent Windows CMD environment assignment is set "CLOUDFLARE_ACCOUNT_ID=...".

## Application structure

- index.html — semantic English landing, forms, dashboard and invitation acceptance.
- styles.css — one consolidated monochrome stylesheet with responsive apartment components.
- app.mjs — auth, apartments, members, invitations, bill calculations, history, payments.
- ui-modal.mjs — reusable accessible branded confirmation / notice dialog; no native browser confirm or alert.
- .gitignore — ignores Wrangler, local dependencies and secrets.

No JavaScript secrets should ever be committed. The frontend contains only a publishable database key and is protected by database-level RLS.


## Apartment owner and billing roster

- Creating an apartment **automatically grants the creator Owner access** through `apartment_members`; no email invitation is ever required for the owner.
- The owner always appears at the top of the household member list, even if the apartment has zero residents. This separates *account access* from *participation in bill splitting*.
- The optional **Include me in bills** action links the logged-in owner's account directly to a resident row using the restricted `add_owner_to_billing` database function. It **does not** send an invitation or create a second apartment member.
- If a matching, unlinked resident name already exists, the action links that record instead of duplicating it (unless it has an active invitation). Repeated requests are idempotent.
- Owners can later opt out of the billing roster without losing Owner access. Existing bill allocation snapshots remain intact.
- Existing apartments and residents remain unchanged until their owner explicitly adds themselves to a bill.

## Unified household manager

- One **Add member** button opens a branded modal with resident name and optional email.
- **Add only** saves an unlinked resident; **Add & invite** creates the resident and immediately sends the secure email invitation.
- The resident list shows **Not invited / Invited / Joined**, plus contextual **Invite / Resend / Revoke / Remove access** actions.
- Sending or resending an invitation does not create a duplicate resident. Invalid email and duplicate name are rejected. A mail delivery failure keeps the resident and offers the private invite-link fallback.
- The old two-column add/invite forms and manual resident dropdown were removed.
- The owner continues to configure residency days and bill shares independently in **Residents & days**. This rollout adds no new database tables or changes to stored bills.

## Apartment workflow

1. Sign in by email magic link (existing Auth email provider).
2. Create an apartment. The server assigns a unique code (OG-...); this code is **not** an access credential.
3. Every new apartment starts empty. Residents are added by its owner; no old private records are imported.
4. Add or edit apartment residents using the unified household member list. Only the owner may modify the roster, billing-period inputs and bill history.
5. Invite a resident by email. The server generates a 256-bit random invite token, stores only its SHA-256 hash, and expires it after 7 days. The invited recipient must verify the matching email before joining. Invitation email is currently sent as an **authentication sign-in/confirmation link** through the existing email service, with the private invite token in the return URL. A copy-link fallback is available if the email service hits quota or fails.
6. Members can view shared bill history and report **their own** payments. The owner confirms receipt; a member cannot independently mark themselves as paid/received.
7. Apartment owners can remove member access and revoke pending invites.

## Live updates, sharing and batch onboarding

- **Manual synchronization only.** The application fetches apartment data when the user signs in, selects an apartment, performs an explicit action, presses **Refresh**, or reloads the page. No realtime WebSocket subscription, background polling, tab-focus fetch, or timed sync is active.
- Manual **Refresh** preserves the current bill type, month, amount and actual meter-reading dates. Pending resident edits are saved first. Updates made on another device remain unseen until an explicit refresh or page reload.
- **Share result** opens the operating system sharing sheet where supported; other browsers copy the formatted breakdown to the clipboard. Sharing is user initiated and does not expose login or invitation tokens.
- **Add multiple** accepts residents separated by line breaks, commas or semicolons. It rejects duplicate/existing names, overly long names and more than 70 residents per apartment. One database insert sends all names together; no invitation email is sent.
- Newly created residents, including the owner opting into bill splitting, start with **4 weeks (28 days)**. After a successful bill save, historical allocations stay unchanged and current resident day preferences are reset to **4 weeks (28 days)** for the next bill. If that second update fails, the user is told the bill was saved but defaults were not reset.
- Realtime publication entries for apartment tables are disabled because this application relies on manual refresh only. Database RLS still controls read permissions.

## Billing behavior

- Currency entry dynamically formats thousands groups in the vi-VN convention, e.g. 160.000.000.
- Month field derives calendar days automatically, including leap years.
- Optional meter-reading start and end dates override month length (inclusive date range).
- Residents can select 1, 2, 3 or 4 weeks (7/14/21/28 days) or custom number of days; a new resident defaults to 4 weeks (28 days).
- Money is allocated with integer arithmetic and largest remainder rounding so all shares sum exactly to the original bill.
- Bills are stored atomically in a single database function. Payment status is preserved when overwriting a matching bill.

## Shared modal

The application uses `confirmAction({title, message, confirmText, cancelText, tone})` from `ui-modal.mjs` for destructive actions and bill confirmation. It returns a `Promise<boolean>`; **only** pressing the explicit confirmation button returns `true`. Escape, backdrop click, close and Cancel return `false`. `showNotice({title, message})` is available for one-button messages. Style lives in `styles.css`, and the native `<dialog>` provides modal semantics and focus trapping (no default browser confirmation popup). No emoji icons or injected dynamic HTML are used.


## Interface languages

- The header exposes **VI / EN** on desktop and mobile. Vietnamese is the default for first-time visitors; the chosen language is remembered in `localStorage` under `oghep-language`.
- `i18n/dictionary.mjs` contains Vietnamese translations, `i18n/index.mjs` handles switching static page text and public metadata while `app.mjs` renders dynamic translations.
- The language switch does **not** reload the page, re-fetch a user's bills, reset an apartment or change stored data. Names and apartment codes are never translated.
- Branded confirmation modals translate buttons, titles, messages and accessibility labels; labels and notices in the app also use the same dictionary.
- **Authentication email templates are configured separately in the server's email settings.** This switch does not automatically translate emails sent by that service.

## New database

New tables (all RLS enabled): apartments, apartment_members, apartment_residents, apartment_invitations, apartment_bills, apartment_allocations.

SQL RPCs:
- create_apartment
- create_apartment_invitation
- accept_apartment_invitation
- revoke_apartment_invitation
- remove_apartment_member
- save_apartment_bill
- mark_apartment_payment_sent

All privileged RPCs check authentication and enforce owner or member role. Invitation acceptance additionally verifies the recipient email matches. The unique resident name index prevents repeating the same resident in one apartment.

Legacy tables remain unchanged: room_members, room_preferences, bill_history. A private, administrator-only backup of legacy room_members data exists in app_private.legacy_member_backup. Community users cannot import it. **Do not drop legacy tables or backup until data has been verified and an intentional migration plan is agreed.**

## Regression tests/checklist

- Login/signout and email links; accept invite with invited email, reject other email.
- Create apartment, show apartment code, choose/switch apartments.
- New apartments start with zero residents; never import private data or display a legacy import toggle.
- Verify owner-only actions; member can read but cannot create/edit bills or manage residents.
- Invite, revoke, expiry, one-time acceptance and owner/remove access.
- Number grouping while typing; no invalid amount; 28/29/30/31 day calendar months.
- Week shortcuts and custom-day values; persistence across reload.
- Exact sharing across seven equal residents, mixed weeks, zero days and rounding.
- Save, reload, overwrite, delete bills; preserve status; report paid, confirm receipt.
- Mobile layout down to 320px; keyboard labels; no emoji or public repository links.
- End-to-end authentication and multi-user invitation need real browser accounts to verify fully.

The application does not process real money or determine actual individual meter consumption.
