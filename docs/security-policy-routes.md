# Route Security Policy

This policy defines authorization expectations for `app/api/**/route.ts`.

## Route classes
- **Public**: intentionally callable without user/session auth.
- **Service-auth**: callable by machine actors only; must use signature/token verification helpers.
- **Capability-protected**: everything else; must enforce `requireCapability(...)` or equivalent shared authorization helper.

## Policy allowlists

```json
{
  "public": [
    "app/api/auth/request-otp/route.ts",
    "app/api/auth/send-otp/route.ts",
    "app/api/ops-login/route.ts"
  ],
  "serviceAuth": [
    "app/api/cron/**/route.ts",
    "app/api/inbound/**/route.ts",
    "app/api/admin/hubbell/upload/route.ts",
    "app/api/admin/hubbell/payments/import/route.ts",
    "app/api/dispatch/agility-route-complete/route.ts"
  ],
  "serviceAuthLegacy": [
    "app/api/inbound/**/route.ts"
  ],
  "unguardedAllowed": [
    "app/api/auth/[...nextauth]/route.ts",
    "app/api/kiosk/**/route.ts",
    "app/api/tv/picks/route.ts",
    "app/api/warehouse/orders/[so_number]/route.ts"
  ],
  "guardPatterns": [
    "requireCapability(",
    "requirePageAccess(",
    "await auth(",
    "verifyCronSignature(",
    "verifyInternalToken(",
    "verifyHubbellUploadToken(",
    "verifyDispatchSyncToken("
  ]
}
```

## Maintenance rules
1. New API routes must either include an approved guard or be explicitly added to `public`/`serviceAuth` with rationale in PR notes.
2. Any route in `serviceAuth` must use standardized service-auth helpers from `src/lib/service-auth.ts` once introduced.
3. CI (`npm run check:route-guards`) is authoritative and must pass.
