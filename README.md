# Ở Ghép — split bills, not friendships

An English-language, responsive roommate expense-splitting web app with a bold, monochrome "Uber Bold Transit" landing design. No images, emojis, frontend framework, paid hosting, or Node build step required.

## Live URLs

- Primary site: **https://oghep.pages.dev/**
- Production source: `main` in [TanBuiDev/roommate-bill-split](https://github.com/TanBuiDev/roommate-bill-split)
- Design preview: `https://design-alpha.oghep.pages.dev/` (as available)
- Older Workers preview: `https://oghep.devbui058.workers.dev/`

**Deploy model:** Pages is a Direct Upload project, not automatically Git-connected. Changes on GitHub do not automatically update the site unless uploaded with Wrangler or the Pages deployment API. The design preview is a separate deployment.

## Source structure

```text
index.html    accessible landing page, SEO / Open Graph metadata, app markup and inline SVG
styles.css    single CSS source: tokens, layout, components, breakpoints and reduced motion
app.mjs       browser-side logic: auth, roommate table, calculation, history, persistence
.gitignore    excludes .wrangler/ and local build artifacts
README.md     documentation
```

Do not reintroduce layered inline style blocks. Keep browser/server integrations and data handling in `app.mjs`. Keep new style rules in `styles.css`.

## Existing features

- Email magic-link signup and login.
- Select electricity, water, internet or other; choose month and billing period.
- Enter total VND amount with empty default placeholder.
- Default residents added once (without removing prior saved residents): Tấn, Tiến, Thành, Huy, Nhựt, Kiệt, Hậu.
- Pick 1–4 weeks or custom number of days for each roommate.
- Proportional division with integer remainder distribution; total of per-person shares equals the bill.
- Add/edit/delete roommates and save duration choices.
- Save, restore and delete monthly bills; mark individual payment status; copy a share summary.
- Mobile layout turns each resident's 8-column row into a responsive grid card without page-wide horizontal scrolling.

The public landing includes three feature cards, three clearly **illustrative scenarios (not actual reviews)**, three **free usage modes (not different paid plans)**, a final call-to-action, privacy/terms information and real GitHub links.

## Accounts / backend

Backend: existing Supabase project `loovjgylbookhouxjkaf` with existing, RLS-protected tables:

- `room_members` (owner, name, sort order, selected week/custom duration)
- `room_preferences` (seeded residents marker)
- `bill_history` (owner, bill type, month, amount, duration snapshot, payment statuses)

Client code only contains a public publishable key. **Never commit service-role, SMTP, Resend or Cloudflare API secrets.** Data and authentication are not part of the visual redesign.

SMTP sends signup confirmation and email login messages via the provider already configured in the project's Auth settings. Hosted email templates are managed separately in Supabase; the web redesign does not update them.

## Local development

The browser imports an ES module, so run a local server rather than opening `index.html` with `file://`.

```sh
python -m http.server 8080
```

Open http://localhost:8080/. A recent browser with JavaScript and an internet connection is needed for the auth module. Configure the local development URL in Auth Redirect URLs if you need to test login locally.

## Deployment

Log in to the Cloudflare account owning `oghep`. From the repository root:

```sh
git pull --ff-only
export CLOUDFLARE_ACCOUNT_ID=37f44fbbb3a0e19e54a87ffa70802fb2
npx wrangler pages deploy . --project-name oghep --branch main
```

Windows **CMD** uses `set "CLOUDFLARE_ACCOUNT_ID=..."`, whereas **Git Bash** uses `export`.

Verify the returned deployment URL, then visit https://oghep.pages.dev/. The `.wrangler/` directory is ignored in Git.

## Regression checklist

1. Authentication sign-in, redirect to the correct domain, persistence across refresh and sign-out.
2. Seven default residents seeded once; prior saved residents and bill history preserved.
3. Edit/add/remove residents; pick 1–4 weeks and custom days; page refresh retains week/custom choices.
4. Enter a VND amount; verify per-person shares add up **exactly** to the bill, including odd amounts and 0-day residents.
5. Save a new bill, overwrite a previous bill, restore, delete, and mark shares as paid.
6. Copy results from a supported browser.
7. Responsive and keyboard operation at 320px, 375px, 768px, 1024px and desktop widths; no page-wide horizontal scroll.
8. No emoji icons, leaked infrastructure branding, fabricated quotes, or ungrounded subscription offers in the visible page.

The calculation is a shared **convention**, not direct measurement of utilities; the app does not accept real payments. 
