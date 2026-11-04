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

## Manual synchronization, sharing and batch onboarding

- **Manual synchronization only.** The application fetches apartment data when the user signs in, selects an apartment, performs an explicit action, presses **Refresh**, or reloads the page. No realtime WebSocket subscription, background polling, tab-focus fetch, or timed sync is active.
- Manual **Refresh** preserves the current bill type, month, amount and actual meter-reading dates. Pending resident edits are saved first. Updates made on another device remain unseen until an explicit refresh or page reload.
- **Share result** opens the operating system sharing sheet where supported; other browsers copy the formatted breakdown to the clipboard. Sharing is user initiated and does not expose login or invitation tokens.
- **Add multiple** accepts residents separated by line breaks, commas or semicolons. It rejects duplicate/existing names, overly long names and more than 70 residents per apartment. One database insert sends all names together; no invitation email is sent.
- Newly created residents, including the owner opting into bill splitting, start with **4 weeks (28 days)**. After a successful bill save, historical allocations stay unchanged and current resident day preferences are reset to **4 weeks (28 days)** for the next bill. If that second update fails, the user is told the bill was saved but defaults were not reset.
- Realtime publication entries for apartment tables are disabled because this application relies on manual refresh only. Database RLS still controls read permissions.

## Full billing period shortcut

- A **Full period / Cả kỳ** choice is available beside the 1–4 week shortcuts for every resident. It automatically uses the currently selected month's calendar day count (28, 29, 30 or 31) or the optional actual meter-reading date range.
- Four weeks always means **28 days**; it does not automatically mean the whole month. A separate `full` mode persists in resident preferences and saved bill allocations, and is restored when editing an old bill.
- The **4 weeks** default for new residents and the reset after saving bills remain unchanged, as requested previously. Existing roster choices and historical payment statuses are not migrated.
- Multi-fee periods that split by days also interpret a resident's `full` mode as the entire fee period.

## Billing behavior

- Currency entry dynamically formats thousands groups in the vi-VN convention, e.g. 160.000.000.
- Month field derives calendar days automatically, including leap years.
- Optional meter-reading start and end dates override month length (inclusive date range).
- Residents can select 1, 2, 3 or 4 weeks (7/14/21/28 days) or custom number of days; a new resident defaults to 4 weeks (28 days).
- Money is allocated with integer arithmetic and largest remainder rounding so all shares sum exactly to the original bill.
- Bills are stored atomically in a single database function. **Overwriting a matching bill resets every participant's payment status to `unpaid`**, since previous payment confirmations must not silently carry over to recalculated amounts. The owner sees this warning before confirming. Migration changes future saves only; it does not retroactively alter historical statuses.

## Saved bill exports and mobile usability

- The top sharing controls use an in-app browser clipboard fallback when native sharing is unavailable; users can also share or copy each individual saved bill in its history card.
- Editing an existing bill restores its saved resident day selections before recalculating, but **payment statuses reset to Unpaid on overwrite**. Loading a bill for editing alone does not change stored payment status.


- Saved electricity/water/internet/other bills have their own **Copy bill / Share bill** actions in history. The content is generated from saved allocations, including resident names, days and exact amounts, **not** today's editable roster or reset inputs.
- When a new bill is saved and the editing form is cleared, the top **Copy / Share** actions stay available by selecting the latest saved bill (prefer the just-saved record), with a clearly visible label showing which saved bill will be shared.
- Multi-fee apartment periods also expose **Copy bill / Share bill** actions in their saved history.
- On mobile, bill export/save controls use a single-column stack below 430px, with touch-sized week controls and two-column history action buttons. Larger screens retain a more compact two-column layout for Copy / Share and a full-width Save button. History controls use a responsive grid and compact, readable status rows. Resident card captions are translated using actual DOM text rather than hardcoded CSS pseudo-content.
- The Web Share API is used when supported; clipboard copying falls back to a selected-text copy on embedded browsers when possible.

## Shared modal

The application uses `confirmAction({title, message, confirmText, cancelText, tone})` from `ui-modal.mjs` for destructive actions and bill confirmation. It returns a `Promise<boolean>`; **only** pressing the explicit confirmation button returns `true`. Escape, backdrop click, close and Cancel return `false`. `showNotice({title, message})` is available for one-button messages. Style lives in `styles.css`, and the native `<dialog>` provides modal semantics and focus trapping (no default browser confirmation popup). No emoji icons or injected dynamic HTML are used.


## Interface languages

- The header exposes **VI / EN** on desktop and mobile. Vietnamese is the default for first-time visitors; the chosen language is remembered in `localStorage` under `oghep-language`.
- `i18n/dictionary.mjs` contains Vietnamese translations, `i18n/index.mjs` handles switching static page text and public metadata while `app.mjs` renders dynamic translations.
- The language switch does **not** reload the page, re-fetch a user's bills, reset an apartment or change stored data. Names and apartment codes are never translated.
- Branded confirmation modals translate buttons, titles, messages and accessibility labels; labels and notices in the app also use the same dictionary.
- **Authentication email templates are configured separately in the server's email settings.** This switch does not automatically translate emails sent by that service.

## Reusable multi-fee templates and billing periods

The existing **simple bill** workflow remains unchanged. Apartment owners can switch the billing editor to **Multi-fee period**. Members may view saved multi-fee periods and payment status, but only an owner can create, edit or delete fee periods and personal templates.

### Starting a period

- **System template** (static JS, zero database lookups): Apartment fees (seven charges, including parking), Rental house, Shared living costs. Suggestions are editable, not contractual fee rules.
- **Own apartment template**: Name your customized fee list and save it in \`apartment_fee_templates\`. Definition stores fee names, rules, participant selections and quantities, **not prior money amounts**. Templates belong only to the active apartment.
- **Copy previous period**: Copy the preceding period's charge structure and values into a *new* editor; explicitly review amounts and participants. The original remains unchanged.
- **Start blank**: Add individual fee lines, optionally delete or edit them. Maximum 30 fee lines.

### Allocation rules

Every charge line has a separate name, amount, eligible residents and sharing method:

- \`days\`: split proportionally to the resident's stored days (up to the calendar month length).
- \`equal\`: split evenly among selected residents.
- \`quantity\`: split by entered number of vehicles / units; a resident with zero units pays nothing.
- \`manual\`: enter exact individual shares; the total must match the charge.

The pure \`fee-engine.mjs\` module uses BigInt for largest-remainder rounding. A multi-fee bill is valid only if every line is allocated exactly and the overall sum of per-person shares equals the sum of charges.

### Storage and safety

- \`apartment_fee_periods\` stores immutable-at-read fee-line snapshots per saved period.
- \`apartment_fee_payments\` stores each person's aggregate share and payment state. Members can report only their own payment, and owners can confirm receipt. An overwritten period resets previous payment confirmations and requires an explicit warning.
- \`save_apartment_fee_period\` validates resident/apartment ownership, amounts and per-line sums on the server before atomically saving a period and its payment rows.
- \`apartment_fee_templates\` uses RLS owner-only CRUD. The new period and payment tables are readable only by apartment members and writable only through permission-checked RPCs.
- No image parsing, external billing-provider integrations, money collection, scheduled tasks, realtime subscriptions or background polling.
- Period list and saved payment states refresh when the user clicks Refresh or reloads the website. Existing simple bills, their allocation records and resident names are left intact.

### Testing checklist

- Open new apartment with no residents; the multi-fee editor must block saving until residents are added.
- Choose Apartment fees; confirm seven editable charge lines, all zero by default; the parking charge allocates only to residents with a positive vehicle count.
- For 2 vehicles versus 1, test odd amounts and exact sum.
- Try manually allocated amounts below/above the actual charge; save must be blocked.
- Save custom template, switch apartments and confirm isolation; reopen template without old currency amounts.
- Copy a previous period and change the month; the old period must remain unchanged.
- Confirm member read-only access; member reports own payment, owner confirms it. Changes on other devices appear on explicit refresh.
- Check mobile narrow screens and VI/EN translation; ensure no native browser confirm/alert and no public source-code links.
- Test authenticated flows in a browser with two distinct accounts before declaring full E2E acceptance.


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
- Save and reload bills; overwrite an existing bill and verify every old `confirmed`/`submitted` payment status resets to `unpaid`; delete bills; report paid and confirm receipt. Do not change existing payment statuses without an explicit overwrite.
- Mobile layout down to 320px; keyboard labels; no emoji or public repository links.
- End-to-end authentication and multi-user invitation need real browser accounts to verify fully.

The application does not process real money or determine actual individual meter consumption.
