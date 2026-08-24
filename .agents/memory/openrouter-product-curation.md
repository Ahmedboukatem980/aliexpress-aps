---
name: OpenRouter product curation
description: Rules for using OpenRouter to shortlist products worth publishing.
---

When the discovery user enables AI selection, OpenRouter may choose among products only after their discount has been verified from a valid original-price and sale-price pair. A supplied percentage that conflicts with the computed percentage is not a qualifying deal.

**Why:** Marketplace discount labels can be stale or misleading, while publishing an unverified “great deal” damages buyer trust. AI selection must improve curation rather than relax the evidence required for a recommendation.

**How to apply:** Keep the strict discount gate before any model call; accept only validated references to the supplied candidate list; honor an empty model recommendation; and retain a bounded, deterministic fallback for provider failures or limits. Keep model use capped by per-client, global, and concurrent-request limits.