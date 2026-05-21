# Hubbell ECI Credential Auto-Login — Handoff from PC agent (2026-05-20)

`hubbell_checks_to_pdfs_po_and_wo.py` (deployed at `/home/api/hubbell/` on
the Pi) was updated to support credential-based auto-login for ECI.
Unblocks unattended runs.

## Why

The original auth flow expected `eci_auth_state.json` to persist across
runs. In practice, **ECI sessions are effectively single-use under headless
mode** — they expire between consecutive scheduled runs. The systemd-driven
daily fetcher kept dying after the first successful run because the
fallback path (`input("Press ENTER...")`) hit `EOFError` immediately under
systemd.

Symptoms before the fix:
- Day 1 (manual reseed): works
- Day 2 (06:00 timer): `exit-code 1` after ~14 seconds, no log entries
- Log file shows `EOFError: EOF when reading a line` from `input()` call

## What changed (`hubbell_checks_to_pdfs_po_and_wo.py`)

### New function `_try_credential_login(page, login_url) -> bool`

Reads `ECI_USERNAME` / `ECI_PASSWORD` from env, navigates to the login
page, probes common form selectors, fills + submits, validates success by
checking the response page is no longer the login page.

Selectors tried (first hit wins):
- Username: `input[name="username"]`, `input[name="userid"]`,
  `input[name="user"]`, `input[id="username"]`, `input[type="text"]`
- Password: `input[name="password"]`, `input[name="pwd"]`,
  `input[id="password"]`, `input[type="password"]`
- Submit: `button[type="submit"]`, `input[type="submit"]`,
  `button:has-text("Login")`, `button:has-text("Sign In")`, fallback to
  Enter on password field

### Updated `open_authenticated_context(p, args)`

Three-tier auth flow:
1. Try saved `eci_auth_state.json`
2. If expired → try credential auto-login (env vars)
3. If creds missing or auto-login fails → manual login (interactive only;
   raises `SystemExit` with a clear error message under systemd instead of
   the misleading `EOFError`)

After successful auto-login, the fresh session is saved back to
`eci_auth_state.json` so subsequent runs in quick succession can reuse it.

## Required environment changes

Two new env vars on the Pi at `/home/api/hubbell/.env`:

```
ECI_USERNAME=<actual ECI username>
ECI_PASSWORD=<actual ECI password>
```

Same vars also need to live in the developer's PC `.env` at
`C:\Users\amcgrean\python\hubbell test\.env` so manual local runs work the
same way.

Confirmed working end-to-end on the Pi on 2026-05-20 (scraped all 47
developments, state saved with 1125 docs tracked).

## What this means for Pi deploy automation

If any deploy/sync script pushes files from PC to Pi (e.g.
`hubbell_pi_deploy.py`):

1. **`hubbell_checks_to_pdfs_po_and_wo.py` must be included in what gets
   pushed.** Source-of-truth copy lives in
   `C:\Users\amcgrean\python\hubbell test\`.
2. **The `.env` on the Pi must include `ECI_USERNAME` and `ECI_PASSWORD`.**
   `hubbell_pi_deploy.py` should NOT overwrite these env vars; the deploy
   should merge new vars in rather than full-replace the `.env` file (or it
   should prompt for them if missing).
3. **Update any env-var table** (e.g.
   `LIVEEDGE_RESPONSE_2026_05_18.md` §6) to add `ECI_USERNAME` and
   `ECI_PASSWORD` alongside `LIVEEDGE_HUBBELL_TOKEN` / `LIVEEDGE_BASE_URL`.
4. **Update sanity-check docs** — replace the "ECI session expired" entry
   with: "ECI auto-login failed → check `ECI_USERNAME` / `ECI_PASSWORD` in
   `/home/api/hubbell/.env`, then re-trigger." The session-expired case
   should no longer occur unless the credentials themselves are wrong or
   ECI changes their login form.

## Edge case: ECI changes their login form

If ECI gets a UI refresh and changes input field names, the auto-login
will print `Could not locate username field; auto-login failed.` (or
password equivalent), then fall through to manual login (which fails under
systemd with the clean SystemExit).

When that happens, append new selectors to `user_selectors` /
`pw_selectors` in `_try_credential_login()`. First hit wins, so order
matters but appending is safe.

## Stable behavior we now depend on

- Saved session is best-effort, not required. The script recovers from any
  session loss as long as credentials in env are correct.
- The systemd timer at 06:00 EDT runs unattended indefinitely.
- The stale-check cron at 14:00 UTC remains the backup alert if something
  genuinely goes wrong (creds rejected, ECI down, etc.).
