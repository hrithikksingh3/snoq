# SNOQ implementation notes

## Architecture

SNOQ uses a React/Vite static client and an Express/Prisma API. The separation keeps sessions, credentials, billing events, AI-provider calls, document storage, reports, and email delivery on the backend. PostgreSQL owns relational application data; Cloudinary stores document binaries independently of ephemeral application disks.

## Authentication and data isolation

Passwords are bcrypt-hashed. The API issues an HTTP-only signed session cookie and derives the user from that cookie, never from a browser-supplied user ID. Resource, list, share-management, document-view/download, personal-export, and administrator queries enforce owner or role scopes on the server.

The administrator UI is never the authorization boundary. Every `/api/admin/*` route runs both session and database-role checks. The `ADMIN_EMAIL` bootstrap setting grants that role at sign-in, while administrators can manage other accounts from the control panel.

## AI-assisted capture

AI providers implement a shared contract. Gemini and OpenRouter adapters return a Zod-validated metadata structure, allowing the API to try a configured eligible fallback. Provider failures do not block the primary product flow: a user can review/edit the draft or save manually.

URL extraction is intentionally separate from AI analysis. It limits protocols, ports, redirects, private network targets, DNS resolution, body size, and fetch duration before any external content is processed.

## Sharing

Lists are owned by one account. A public share has an opaque slug; a restricted share collects an access request, lets the owner approve it, and sends an access token only after approval. Tokens are stored as hashes. Branded email templates make the request and approval flow understandable without exposing internal data.

## Plans, coupons, and payment

Plans define price, duration, and AI-credit allowance. Administrators create, edit, hide, activate, and deactivate plans. Coupons may target a plan, have a validity window and redemption cap, or grant time for 100%-off flows. Razorpay checkout derives the amount and entitlement server-side. Signed webhooks use durable idempotency records so duplicate provider deliveries do not activate the same subscription twice.

## Reports and exports

Administrators can generate current Excel and PDF reports with user, subscription, and coupon information. The reports are generated in memory by the server after admin authorization and are returned as private, non-cacheable attachments.

Users on a plan with reports enabled can export the entire vault or a selected owned list. Administrators configure that entitlement per plan; the migration enables it for existing paid plans and leaves the complimentary plan locked. The Excel export is structured for reuse; the white, tabular PDF is formatted for reading and includes clickable Open buttons for saved URL resources. The email workflow intentionally derives the recipient from the authenticated account, attaches the PDF, and does not accept a destination email from the browser. Result sizes are capped to keep the operation reliable.

The PDF is not a plain data dump: it repeats the owner header, light owner-email watermark, resource-table heading, branded footer links, and page number on every page. This makes shared internal reports readable while preserving a clear privacy signal. Empty collections receive an intentional empty state rather than a blank table.

## Security and scaling

Input validation uses Zod, database calls use Prisma, browser state-changing calls use an origin guard, security headers are added at the API, and high-cost/sensitive flows have specific rate limits. In-process rate limits are suitable for a single small service; a multi-instance production system should move limits and asynchronous broadcasts/reports to shared infrastructure such as Redis and a queue.

For higher volume, add pagination/streamed report generation, background export jobs with encrypted temporary storage and expiry, audit logs for administrative actions, email verification/MFA, and malware scanning before broad document-upload access.
