# Ở Ghép — shared apartment billing

A lightweight apartment billing app with a black-and-white Uber Bold Transit interface, Vietnamese/English translations, and no public repository links in website navigation or footer.

## URLs and deployment

Production: https://oghep.pages.dev/

Cloudflare Pages project: `oghep`, **Direct Upload** (the existing project is retained).

### GitHub Actions CI/CD

The repository uses [`.github/workflows/unified-billing-tests.yml`](.github/workflows/unified-billing-tests.yml) to:

1. On pull requests: check JavaScript syntax and run the billing regression tests; **never deploy a PR**.
2. On pushes to `main`: run the same tests, then build a clean `dist/` directory containing only public site files (`index.html`, `styles.css`, root `*.mjs`, and `i18n/*.mjs`).
3. Deploy `dist/` to the existing `oghep` production Pages project using `cloudflare/wrangler-action@v4`.
4. Publish `deploy-version.json` with the commit SHA, then check `https://oghep.pages.dev/deploy-version.json` to verify the production site serves exactly that revision.

The deployment runs **only after the test job succeeds**. A missing token causes the deploy job to fail clearly; it never silently reports a successful release. Production can also be deployed manually from **Actions → Test and deploy O Ghep → Run workflow** on `main`.

### One-time GitHub secret setup (required before the first automatic deploy)

1. Create a Cloudflare API token under [Cloudflare → API Tokens](https://dash.cloudflare.com/profile/api-tokens). Restrict the token to **Account → Cloudflare Pages → Edit** for the account that owns `oghep`. Do not share the token in chats or commit it to Git.
2. Open [GitHub → repository Actions secrets](https://github.com/TanBuiDev/roommate-bill-split/settings/secrets/actions). Choose **New repository secret**, set the name to **`CLOUDFLARE_API_TOKEN`**, and paste the token as its value.
3. In the [Actions tab](https://github.com/TanBuiDev/roommate-bill-split/actions/workflows/unified-billing-tests.yml), re-run the failed deployment job, or use **Run workflow** on `main` to publish immediately.

The Cloudflare Account ID is a non-secret project identifier stored in the workflow, so no `CLOUDFLARE_ACCOUNT_ID` secret is required. The workflow uses the repository-provided `GITHUB_TOKEN` to report deployment status, and it does not require Supabase service-role credentials.

**Do not** create a second Cloudflare Pages project or change the existing production project to Git integration. This setup retains the Direct Upload deployment model.

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


## Three-step authenticated dashboard UI

The signed-in application is a clean workspace rather than the public marketing landing. The public hero/features/use-cases/pricing/footer remain available when signed out. Logged-in owners see these sections:

1. **Members** — apartment roster, invitations and access controls (the apartment switcher is always visible).
2. **Calculate monthly bills** — billing month, collapsible **A. Residents & days** (reusing the current desktop week/full-period table and its responsive resident cards), **B. Bills for this month** (multiple built-in/custom grouped charges, include/exclude checkboxes), and **C. Totals & allocations** (per-person result, save and share).
3. **Payment history** — one history panel containing monthly settlements and earlier standalone bills, both retaining copy/share/payment status/edit/delete actions as authorized.

This is a layout refactor: the `dashboard-layout.mjs` module **moves** the existing live resident board and multi-fee history into the new sections, without recreating its controls or changing their event bindings. It also adds authenticated application navigation and hides marketing sections only after authentication. Old standalone bills remain editable through their explicit history action.

Non-owner apartment members can view the consolidated saved history; owner-only calculation and management controls stay hidden. The selected billing month controls the **Full period** number of days. Optional meter-reading dates are applied only when explicitly editing a legacy standalone bill, not when calculating a new monthly settlement.

The layout has DOM smoke tests in `tests/dashboard-layout.test.mjs`, and its production code is syntax-tested by the existing GitHub Actions pipeline. All new application files are automatically included in the static Cloudflare Pages upload.

**Release verification:** GitHub Actions must confirm the production `deploy-version.json` commit matches the latest `main` commit; the repository's contents being updated alone is not proof that Cloudflare is serving the new UI.

## November 2026 UX consolidation (current workflow)

The latest authenticated dashboard keeps the original black-and-white identity and the approved resident/week table, but applies one consistent soft-card, rounded-input, lightweight-shadow design system.

- The top of the dashboard is **one apartment card**: dashboard heading and explanation, apartment name/code, owner/member role, live resident count, apartment switcher and compact copy/create actions.
- Each monthly bill category uses **one sharing rule** for its complete group of subfees. `Default (days)` is the UI label for the unchanged internal `days` rule; it reads section A's configured days automatically, shows a short explanation and does **not** display the resident checkbox table. Previously stored hidden exclusions are ignored for the current Default calculation.
- `equal`, `quantity`, and `manual` show **one resident list per bill**, not one list for every subfee. A manual amount is entered per resident for the **whole bill**. The pure group adapter apportions whole-bill resident targets back into individual saved fee rows, preserving exact VND sums.
- Older stored bills with genuinely different subfee sharing rules show **Existing mixed rules** when reopened; the user can explicitly choose a single rule to unify them. Existing saved history is not rewritten behind the scenes.
- The **Use last month's template** action appears beside the billing-month picker, before any bill data is entered; it copies fee structure but clears amounts. It asks before replacing an unfinished draft.
- The bottom of the calculator has one primary **Save monthly settlement** action, followed by balanced **Copy bill as message** and **Share breakdown** secondary actions. Copy/share use identical charge and resident text. Unsaved results are clearly labelled as a draft.
- The layout is responsive from small phones through tablets and desktop. Reduced-motion preferences are honored. The underlying Supabase schema, RPC contracts and historical payment statuses are unchanged.

## Unified monthly billing (new editor)

- The visible bill editor is unified: one month, many bill categories, one selected-total and one resident breakdown. The old Simple/Multi tab switch is hidden. Older single bills and payment history remain readable; existing database rows are not migrated or deleted.
- Default bill categories: Electricity; Cold water (two subfees: Cold water + one combined "Drainage and wastewater treatment (XLNT)"); Management (Indoor + Outdoor); Building committee remuneration (Remuneration + Operating contribution); Motorcycle parking; Internet; Rent; Shared living costs.
- Click **Create custom bill type** to add an apartment-specific category with one or more subfees and a default sharing rule; built-in categories are read-only. Categories are stored as definitions in the existing owner-only \`apartment_fee_templates\` table. Saved history is not rewritten when a definition is edited or deleted.
- Choosing the same category twice opens its existing draft instead of creating a duplicate. Each bill can contain several individual fees, and each fee may use \`days\`, \`equal\`, \`quantity\`, or \`manual\` allocation.
- Adding a bill checks it by default. Unchecking excludes the full bill from the selected total and resident shares **without losing entered subfees**. In the stored \`apartment_fee_periods.items\` snapshot, unchecked subfees use \`amount=0\`, \`original_amount=<entered>\`, \`enabled=false\`, and \`allocations=[]\`; existing \`save_apartment_fee_period\` validation continues to work without schema changes.
- Saved monthly settlements use the reserved period name \`Monthly summary\` and are unique per apartment and month. Overwriting warns that payment confirmations reset, as in the previous implementation. Previous multi-fee periods retain their separate names and remain visible in history.
- Current editable draft is cached in sessionStorage per apartment and month. Explicitly copying a previous period clears the copied amounts, preserving only fee names and sharing rules.
- The shared Residents & days board remains available for selecting 1–4 weeks, custom days and Full period. The new editor's month controls the Full period calendar-day count. Old single-bill editor and its misleading standalone summary are hidden, but historical single-bill records stay readable.
- The client-side pure module \`unified-billing-core.mjs\` encapsulates selected-item calculation and snapshot conversion. Test suite: \`node --test tests/unified-billing.test.mjs\`.
- **Deployment:** Cloudflare Pages remains Direct Upload. After one-time GitHub secret configuration, pushes to `main` automatically test and deploy a clean static artifact through GitHub Actions. GitHub commits are not deployed automatically until the Cloudflare Pages API token is available.

## Reusable multi-fee templates and billing periods (legacy implementation)

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
