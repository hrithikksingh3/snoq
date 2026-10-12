# Deploying SNOQ

## Production release order

1. Update the API service environment variables.
2. Run `npm run db:deploy` against the production PostgreSQL database.
3. Deploy the API and confirm `/health` responds with `{ "ok": true }`.
4. Deploy the static client with the correct `VITE_API_URL`.
5. Verify sign-in, cookie persistence, a manual resource save, an AI-assisted save, Razorpay webhook delivery, an administrator report export, and an entitled user's personal PDF/Excel export.

Do not skip migrations. The schema contains subscription, sharing, access-request, and webhook-idempotency tables required by the current application.

## Render backend

Create a Node Web Service with `server` as its root directory.

- **Build command:** `npm install && npm run db:generate && npm run build`
- **Start command:** `npm run start`
- **Migration command:** `npm run db:deploy` once per release, using the production `DATABASE_URL`

Set every backend variable shown in `server/.env.example`. At a minimum, production requires a Neon `DATABASE_URL`, a unique 32+ character `JWT_SECRET`, `NODE_ENV=production`, exact HTTPS `FRONTEND_URL` and `BACKEND_URL`, and `COOKIE_SECURE=true`.

Run `npm run db:generate -w server` with the normal Prisma engine before building. The direct PostgreSQL connection used by SNOQ must not use Prisma's `--no-engine` generation mode.

The server rejects insecure production configuration. `FRONTEND_URL` must be the exact public browser origin because CORS and session cookies are credentialed.

### Provider configuration

- **Cloudinary:** set all three credentials. PostgreSQL stores metadata/object IDs; Cloudinary stores the document bytes.
- **Resend:** set `RESEND_API_KEY` and a verified `EMAIL_FROM`, such as `SNOQ <noreply@yourdomain.com>`. This powers password resets, sharing workflows, and coupon announcements.
- **Twilio:** configure only when coupon SMS announcements are intended.
- **Google:** set `GOOGLE_CLIENT_ID` on the API and register the exact production frontend origin with Google. The login page fetches the public client ID from the API at runtime, so changing it does not require placing it in the static-site environment.
- **Razorpay:** set API key ID/secret and `RAZORPAY_WEBHOOK_SECRET`. Create a webhook pointing to the documented API endpoint and subscribe it to the payment/subscription events the billing route verifies.
- **AI providers:** set the selected primary key/model and, if desired, a separately configured fallback provider.

## Render frontend

Create a Static Site with `client` as its root directory.

- **Build command:** `npm install && npm run build`
- **Publish directory:** `dist`
- **Public environment:** `VITE_API_URL=https://your-api-host/api`

Configure the SPA rewrite `/* → /index.html`. Never put `JWT_SECRET`, database URLs, AI keys, Cloudinary secrets, Resend keys, Razorpay secrets, or Twilio credentials in the frontend environment.

## Administrator controls and reports

Set `ADMIN_EMAIL` to the administrator's exact sign-in email. The `/admin` frontend route is only a convenience; the API independently enforces authenticated `ADMIN` role on every admin endpoint.

The report endpoint generates `.xlsx` and `.pdf` files on the server. Responses are `private, no-store`, use an attachment disposition, and have a dedicated `REPORT_RATE_LIMIT_MAX` setting. Exported files contain account and billing-related operational data, so treat them as confidential: limit administrator accounts, store downloaded reports securely, and do not send them as public links.

Users on plans with the configurable report entitlement can export their own vault or one owned list from Settings. The email-report endpoint never accepts an arbitrary recipient and sends the styled PDF attachment only to the authenticated account's email address. Keep `USER_EXPORT_RATE_LIMIT_MAX` conservative, configure a verified Resend sender, and treat attachments as private data. The `202609180003_plan_report_exports` migration enables reports for existing paid plans and leaves the complimentary plan locked; administrators can change this per plan from Admin.

## Cookie and cross-origin checks

Before release, confirm all of the following:

- Client and API use HTTPS.
- `FRONTEND_URL` has no mismatch in protocol, host, or port.
- Browser requests include credentials and responses set the session cookie.
- The API allows only the configured frontend origin.
- `COOKIE_SECURE=true` and production session cookies use `SameSite=Lax`.
- Sign-out and password changes invalidate prior sessions as expected.

## Post-deploy verification

1. Register/sign in with a normal user and verify access stays scoped to that account.
2. Sign in with `ADMIN_EMAIL` and verify `/admin` opens; a non-admin must be rejected by the API.
3. Create a plan and a time-limited coupon. Check the plan/coupon status in Admin.
4. Complete a Razorpay test payment and verify the signed webhook activates the subscription exactly once.
5. Request and approve restricted list access; confirm both branded emails arrive.
6. Download the Excel and PDF admin reports and ensure the expected user, subscription, and coupon summaries are present.
7. Check API logs for rejected CORS, CSRF, webhook-signature, and rate-limit events without exposing request secrets.
8. Confirm `GET /health` remains public, returns only `{ "ok": true }`, and includes the expected API security headers.

## Operational rotation and recovery

- Rotate provider keys, `JWT_SECRET`, webhook secrets, and provider credentials in the host environment; redeploy the API after rotation.
- When rotating `JWT_SECRET`, existing sessions are intentionally invalidated.
- When changing provider models, update only that provider's model variable and retain a tested fallback before release.
- Monitor email/billing provider dashboards and API logs. Do not put raw provider responses, authorization headers, or passwords in user-facing errors.
