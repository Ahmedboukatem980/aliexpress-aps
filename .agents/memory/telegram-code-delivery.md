---
name: Telegram code delivery
description: How login-code delivery is surfaced and retried in the Telegram sign-in flow.
---

Telegram decides whether a login code is delivered inside an already logged-in Telegram app or by SMS. The sign-in interface must tell the user which destination was selected instead of implying SMS delivery.

**Why:** Users may wait for an SMS even though Telegram safely delivered the code to the official Telegram conversation on another logged-in device.

**How to apply:** Preserve the delivery signal returned by the Telegram client, show the in-app instruction when applicable, and keep SMS resend as an explicit user action to avoid unnecessary rate limits. Persist the temporary Telegram session with the code hash so code confirmation can resume after a server restart.