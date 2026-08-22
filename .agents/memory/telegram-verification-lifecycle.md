---
name: Telegram verification lifecycle
description: Rules for safely recovering Telegram code-delivery attempts after server restarts or code expiry.
---

Treat every pending Telegram verification code as time-bound. If the saved attempt has expired or lacks a trustworthy timestamp, clear its temporary session and return to the request-code step before attempting verification or resend.

**Why:** Telegram invalidates short-lived verification attempts. Preserving a stale `code_sent` state makes the interface look recoverable while preventing a meaningful new request or producing opaque verification failures.

**How to apply:** Persist a send timestamp or expiry with each new code request, evaluate it whenever auth state is restored, and reset the pending attempt when it is no longer valid. Keep the post-expiry user path focused on requesting a fresh code.