---
name: Spy image source priority
description: How the channel monitor chooses a product image when a post includes both Telegram media and AliExpress links.
---

When a monitored Telegram post contains an attached image, evaluate it before fetching an image from a linked product page. The default should filter visible competitor channel watermarks first; users may explicitly allow or disable source media.

**Why:** Bundle, coin, and promotion links can resolve to a different product page or a generic preview, while the media attached to the source post usually represents the advertised item.

**How to apply:** Keep source-media priority with watermark filtering enabled by default and skip remote image previews whenever source media exists. For the common top-banner logo, crop the source's top branding strip. If source media remains unusable, publish without an image unless the user explicitly chooses to ignore source media.