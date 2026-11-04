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
- .gitignore — ignores Wrangler, local dependencies and secrets.

No JavaScript secrets should ever be committed. The frontend contains only a publishable database key and is protected by database-level RLS.

## Apartment workflow

1. Sign in by email magic link (existing Auth email provider).
2. Create an apartment. The server assigns a unique code (OG-...); this code is **not** an access credential.
3. When creating a new apartment, owners can choose to import existing resident records. The legacy import is deduplicated by normalized name and prioritizes non-default duration selections. No legacy rows are deleted.
4. Add or edit apartment residents. Only the owner may modify the roster, billing-period inputs and bill history.
5. Invite a resident by email. The server generates a 256-bit random invite token, stores only its SHA-256 hash, and expires it after 7 days. The invited recipient must verify the matching email before joining. Invitation email is currently sent as an **authentication sign-in/confirmation link** through the existing email service, with the private invite token in the return URL. A copy-link fallback is available if the email service hits quota or fails.
6. Members can view shared bill history and report **their own** payments. The owner confirms receipt; a member cannot independently mark themselves as paid/received.
7. Apartment owners can remove member access and revoke pending invites.

## Billing behavior

- Currency entry dynamically formats thousands groups in the vi-VN convention, e.g. 160.000.000.
- Month field derives calendar days automatically, including leap years.
- Optional meter-reading start and end dates override month length (inclusive date range).
- Residents can select 1, 2, 3 or 4 weeks (7/14/21/28 days) or custom number of days.
- Money is allocated with integer arithmetic and largest remainder rounding so all shares sum exactly to the original bill.
- Bills are stored atomically in a single database function. Payment status is preserved when overwriting a matching bill.

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

Legacy tables remain unchanged: room_members, room_preferences, bill_history. A private backup of the old room_members data exists in app_private.legacy_member_backup. **Do not drop legacy tables or backup until data has been verified and an intentional migration plan is agreed.**

## Regression tests/checklist

- Login/signout and email links; accept invite with invited email, reject other email.
- Create apartment, show apartment code, choose/switch apartments.
- Import legacy names: seven unique Tấn, Tiến, Thành, Huy, Nhựt, Kiệt, Hậu from 21 duplicated rows without modifying originals.
- Verify owner-only actions; member can read but cannot create/edit bills or manage residents.
- Invite, revoke, expiry, one-time acceptance and owner/remove access.
- Number grouping while typing; no invalid amount; 28/29/30/31 day calendar months.
- Week shortcuts and custom-day values; persistence across reload.
- Exact sharing across seven equal residents, mixed weeks, zero days and rounding.
- Save, reload, overwrite, delete bills; preserve status; report paid, confirm receipt.
- Mobile layout down to 320px; keyboard labels; no emoji or public repository links.
- End-to-end authentication and multi-user invitation need real browser accounts to verify fully.

The application does not process real money or determine actual individual meter consumption.
