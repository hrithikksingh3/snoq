# SNOQ security and production-hardening audit

**Audit date:** 2026-09-18  
**Scope:** Repository source, Prisma schema/migrations, Render configuration, frontend API client, dependency lockfile, and safe local tests. No production infrastructure, live database data, credentials, payment accounts, email providers, or external targets were accessed or changed.

## Architecture and attack surface

SNOQ is a React/Vite static frontend with an Express 5 TypeScript API, Prisma/PostgreSQL data layer, Cloudinary uploads, Gemini/OpenRouter AI analysis, Resend email, optional Twilio SMS, Google identity-token login, Razorpay subscriptions, and Render deployment configuration.

| Surface | Auth / authorization | Review result |
| --- | --- | --- |
| `/api/auth/*` | Public except profile/avatar/password changes | Passwords use bcrypt (cost 12); sessions are signed HttpOnly cookies; Google ID tokens are verified server-side. Tight per-IP limits added to login, signup, Google sign-in, and reset routes. |
| `/api/resources/*` | Required; resource and document queries are scoped to the authenticated owner | Ownership checks were present. Input/query bounds, upload signature validation, private document responses, AI limits, and SSRF controls were strengthened. |
| `/api/lists/*` | Required; list ownership is checked | List/share ownership checks were present. |
| `/api/shared/*` | Public by design | Public lists expose only an explicit safe resource DTO. Restricted list access tokens are hashed. Request-spam protection was added. |
| `/api/billing/*` | Plans public; member routes authenticated; Razorpay webhook signature-authenticated | Price/plan are server-derived. Webhook validation, replay protection, and first-activation fulfillment were strengthened. |
| `/api/admin/*` | `requireAuth` + database role check | Server-side administrator authorization was present. Coupon broadcasts and admin report generation have bounded rate limits. |
| `/api/exports/*` | Required; owner-scoped and paid-plan entitlement checked | Personal vault/list downloads use owner-scoped queries. PDF email attachments can be sent only to the current account email after the active plan enables reports. |
| Uploads/downloads | Required; resource owner only | Upload size, extension/MIME/signature checks and generated storage IDs added. Downloads continue through authenticated API routes. |

## Confirmed findings fixed

### High

1. **Cookie-authenticated state changes lacked a CSRF defense.**
   - Added an Origin guard for POST, PUT, PATCH, and DELETE API calls. Browser requests must originate at the configured `FRONTEND_URL`; Razorpay’s separately authenticated raw webhook remains outside this guard.
   - CORS now permits only the configured origin, credentialed requests, explicit methods, and `Content-Type`.

2. **URL analysis had an SSRF risk.**
   - URL extraction now permits HTTP/HTTPS only, blocks credentials and non-standard ports, rejects loopback/private/link-local/multicast/reserved targets, validates every redirect, limits redirects/body size/time, and uses a guarded DNS lookup at connection time.

3. **Document and avatar uploads trusted filename/MIME declarations.**
   - Added allowlisted MIME-to-extension matching and magic-byte/text validation for PDFs, DOCX, text formats, JPEG, PNG, and WebP.
   - Cloudinary document public IDs are now server-generated UUIDs rather than derived from the uploaded filename.
   - API resource responses no longer expose stored Cloudinary document URLs. Only authenticated view/download endpoints fetch them, with a timeout and `private, no-store` cache policy.

4. **Payment webhook delivery could replay activation effects.**
   - Webhook requests now have a strict raw-body size, signature verification, payload validation, provider event IDs (or a body hash fallback), persisted idempotency records, and email fulfillment only when a subscription first becomes active.
   - Paid checkout no longer consumes a coupon redemption before provider activation. It records the coupon on the pending subscription and redeems it on successful activation.

### Medium

5. **Sensitive endpoints relied only on a broad API rate limit.**
   - Added configurable per-IP limits for credentials, password resets, AI analysis, checkout, public access requests, and coupon broadcasts. Defaults are documented in `server/.env.example`.

6. **Production transport/cookie configuration could be accidentally weakened.**
   - Environment validation now rejects a production API configuration without `COOKIE_SECURE=true` and HTTPS frontend/backend URLs.

7. **Security response headers were absent from API responses.**
   - Added API CSP, frame denial, MIME-sniffing prevention, referrer policy, permissions policy, and production HSTS.

8. **Cross-account tag metadata was visible to any authenticated account.**
   - `/api/tags` is now limited to tags used by the current account’s active resources.

9. **Error responses could return excessive validation/database details.**
   - Malformed JSON and upload errors now get safe 400/413 responses. Prisma constraint errors return generic conflict/not-found responses. Provider email errors no longer log the provider response body.

10. **External mail/SMS/document fetches had no explicit timeouts.**
    - Added finite timeouts to Resend, Twilio, Razorpay checkout, and the document proxy.

11. **Restricted-list access requests could repeatedly email an owner.**
    - Existing pending requests now return a neutral accepted response without sending another owner email; the public form is rate-limited.

12. **Data-export email could otherwise become an arbitrary-recipient mail relay.**
    - Added a dedicated authenticated export route that derives the recipient from the session's user record rather than accepting an email address from the browser.
   - List exports use owner-scoped lookup, PDF/Excel responses use `private, no-store`, paid-plan entitlement is enforced on the API, and downloads/email requests have a conservative dedicated rate limit.

13. **Browser Google configuration duplicated a build-time value and could hide sign-in.**
   - The login page now reads the public Google client ID from a small runtime API configuration endpoint. The server continues to verify every returned Google ID token against that identifier, and the client secret remains server-only.
   - The Google credential callback now submits the expected credential field, waits for Google's asynchronously loaded browser script, and reports a precise account-linking conflict when a Google identity belongs to another SNOQ account.

## Existing controls verified

- Prisma is used for database access; no raw dynamic SQL was found.
- Resource, list, archive/favorite, document-view/download, share management, and admin operations enforce server-side authentication and ownership/role checks.
- Password reset tokens use `crypto.randomBytes`, are stored as SHA-256 hashes, expire after 30 minutes, and are deleted after use.
- Session cookies are HttpOnly; production settings require Secure + `SameSite=None` for the split Render origins.
- Razorpay prices and plan identifiers are looked up server-side; the browser does not set entitlement, price, or payment state.
- Public shared-list responses intentionally omit document storage URLs and document binary access.
- No tracked production `.env` files and no common credential-pattern matches were found in repository source/configuration. No secret values are included in this report.
- `npm audit --omit=dev --json` reported **0 known vulnerabilities** in the current dependency tree.

## Regression coverage and verification

- Added tests for SSRF target rejection and URL normalization.
- Added tests for document and avatar signature validation.
- Added an HTTP smoke test for the public health endpoint, baseline API security headers, and cross-origin write rejection.
- `npm test` — passed: 5 files, 16 tests. Coverage includes SSRF/URL validation, upload validation, report rendering, and a live HTTP security smoke test.
- `npm run typecheck` — passed for both client and server.
- `npm run lint` — passed for both client and server with no warnings.
- `npm run build -w server` — passed. Vite produced an optimized client release bundle after being granted access to its required esbuild subprocess.
- `npm audit --omit=dev --json` — passed with 0 known vulnerabilities.
- A static scan found no use of `dangerouslySetInnerHTML`, `innerHTML`, `eval`, dynamic functions, child-process execution, TypeScript suppression comments, or tracked secret-bearing environment files. This is not a replacement for secret scanning in CI.

## Required release steps

1. Stop the local API/dev processes that are holding Prisma’s native engine, then run:
   ```powershell
   npm run db:generate
   npm run typecheck
   npm test
   npm run build
   ```
2. Review and apply the new migrations during deployment:
   - `202609180001_security_hardening`
   - `202609180002_payment_webhook_idempotency`
   Use `npm run db:deploy -w server` against the intended deployment database.
3. In Render, verify all backend values in `server/.env.example`, especially `NODE_ENV=production`, HTTPS `FRONTEND_URL`/`BACKEND_URL`, `COOKIE_SECURE=true`, a 32+ character `JWT_SECRET`, webhook secret, and provider credentials.
4. Configure Razorpay webhook delivery to the API’s `/api/billing/webhook` over HTTPS and test a real sandbox payment activation/cancellation once.
5. Rotate any credentials immediately if they were ever committed outside this repository. This audit found no tracked secret exposure but cannot verify external history, deployment dashboards, or prior screenshots.

## Remaining risks and recommended follow-up

- **Cloudinary privacy:** SNOQ now avoids exposing document delivery URLs through its API, but Cloudinary folder/delivery configuration was not externally verified. Use private/authenticated delivery or signed URLs at the provider level for confidential documents.
- **Malware scanning:** File signature checks are not antivirus or sandboxing. Add a malware-scanning pipeline before enabling uploads for untrusted/public users.
- **Rate limits are in-process:** `express-rate-limit` defaults are per API instance. Use a shared store such as Redis and a queue for multi-instance Render scaling or high-volume traffic.
- **Email/SMS broadcasts are synchronous:** Requests are capped at 500 recipients and three broadcasts/hour, but reliable high-volume delivery needs a durable job queue, retries, recipient preferences, and audit logs.
- **Report generation is synchronous:** Personal PDF reports are bounded to 100 displayed resources and Excel exports to 5,000 rows. Move large exports to a queued job with encrypted, expiring storage before supporting high-volume accounts.
- **Webhook retention:** Idempotency events are retained indefinitely. Add a scheduled retention task once operational jobs exist.
- **Static-site headers:** API headers are enforced in Express. Configure equivalent CSP, HSTS, and frame protections at Render/CDN level for the static frontend after verifying Google Identity Services and required third-party image/script domains.
- **Account security:** Email verification, MFA, account-level credential-stuffing telemetry, administrative audit logs, and security-event alerting are not implemented.
- **Payment integration:** Razorpay credentials/plan IDs/offers and real provider events were intentionally not exercised. Verify currency, plan linkage, cancellation, refund, and reconciliation behavior in a sandbox before collecting real payments.

## Self-review

The changes preserve the existing REST/Prisma architecture. They do not add a new framework, expose secrets, alter production services, or remove legitimate browser flows. The main functional compatibility considerations are expected: production must have HTTPS/cookie configuration, malformed or spoofed uploads will now be rejected, and cross-origin browser writes must originate from the configured frontend.
