---
name: Spy image source priority
description: How the channel monitor chooses a product image when a post includes both Telegram media and AliExpress links.
---

When a monitored Telegram post contains an attached image, evaluate it before fetching an image from a linked product page. The default should filter visible competitor channel watermarks first; users may explicitly allow or disable source media.

**Why:** Bundle, coin, and promotion links can resolve to a different product page or a generic preview, while the media attached to the source post usually represents the advertised item.

**How to apply:** Try verified remote product images first. Keep source media as the last fallback, cropping its common top branding strip when filtering is enabled. If no candidate matches the product, use the source image or publish without an image; never accept an unrelated product image.