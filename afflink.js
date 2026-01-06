const got = require("got");
const { URL } = require("url");
const { getProductDetails } = require('./aliexpress-api');


async function getFinalRedirect(url, maxRedirects = 10) {
    let currentUrl = url;
    let bestUrl = url;
    
    for (let i = 0; i < maxRedirects; i++) {
        try {
            const response = await got(currentUrl, {
                followRedirect: false,
                https: { rejectUnauthorized: false },
                timeout: { request: 10000 },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            if (response.headers.location) {
                let nextUrl = response.headers.location;
                if (nextUrl.startsWith('/')) {
                    const urlObj = new URL(currentUrl);
                    nextUrl = `${urlObj.protocol}//${urlObj.host}${nextUrl}`;
                }
                
                if (nextUrl.includes('productIds=') || nextUrl.includes('/item/')) {
                    bestUrl = nextUrl;
                }
                
                if (nextUrl.includes('/error/') || nextUrl.includes('404')) {
                    console.log("Stopping at 404, using best URL:", bestUrl);
                    return bestUrl;
                }
                
                currentUrl = nextUrl;
            } else {
                return currentUrl;
            }
        } catch (err) {
            if (err.response && err.response.headers && err.response.headers.location) {
                let nextUrl = err.response.headers.location;
                if (nextUrl.startsWith('/')) {
                    const urlObj = new URL(currentUrl);
                    nextUrl = `${urlObj.protocol}//${urlObj.host}${nextUrl}`;
                }
                
                if (nextUrl.includes('productIds=') || nextUrl.includes('/item/')) {
                    bestUrl = nextUrl;
                }
                
                if (nextUrl.includes('/error/') || nextUrl.includes('404')) {
                    console.log("Stopping at 404, using best URL:", bestUrl);
                    return bestUrl;
                }
                
                currentUrl = nextUrl;
            } else {
                console.error("❌ Redirect error:", err.message);
                return bestUrl !== url ? bestUrl : currentUrl;
            }
        }
    }
    
    return currentUrl;
}


function extractProductId(url) {
    try {
        const u = new URL(url);

        // 1) productIds في query
        if (u.searchParams.has("productIds")) {
            const pIds = u.searchParams.get("productIds");
            if (pIds && pIds.includes(',')) return pIds.split(',')[0];
            return pIds;
        }
        
        // 1.1) itemId في query
        if (u.searchParams.has("itemId")) {
            return u.searchParams.get("itemId");
        }

        // 2) redirectUrl
        if (u.searchParams.has("redirectUrl")) {
            const decoded = decodeURIComponent(u.searchParams.get("redirectUrl"));
            const m = decoded.match(/item\/(\d+)\.html/);
            if (m) return m[1];
            
            // البحث عن productIds داخل redirectUrl المشفر
            const m2 = decoded.match(/productIds=(\d+)/);
            if (m2) return m2[1];
        }
        
        // 2.1) xman_goto
        if (u.searchParams.has("xman_goto")) {
            const decoded = decodeURIComponent(u.searchParams.get("xman_goto"));
            const m = decoded.match(/item\/(\d+)\.html/);
            if (m) return m[1];
            
            const m2 = decoded.match(/productIds=(\d+)/);
            if (m2) return m2[1];
        }

        // 3) الرابط العادي /item/xxxx.html
        const m = u.pathname.match(/item\/(\d+)\.html/);
        if (m) return m[1];

        return null;
    } catch {
        return null;
    }
}


async function idCatcher(input) {
    if (!input || typeof input !== "string") return null;

    if (/^\d+$/.test(input)) {
        return { id: input };
    }

    if (!input.startsWith("http")) {
        input = "https://" + input;
    }

    let finalUrl = await getFinalRedirect(input);
    
    console.log("Final URL after redirects:", finalUrl);

    const id = extractProductId(finalUrl);
    
    console.log("Extracted Product ID:", id);

    return { id, finalUrl };
}


async function fetchLinkPreview(productId) {
    // Try AliExpress API first
    try {
        const apiResult = await getProductDetails(productId);
        
        if (apiResult && apiResult.title) {
            console.log("✅ Product fetched via API - Title:", apiResult.title.substring(0, 50) + "...");
            return {
                title: apiResult.title,
                image_url: apiResult.image_url,
                price: apiResult.sale_price || apiResult.price || "غير متوفر",
                original_price: apiResult.original_price,
                discount: apiResult.discount,
                currency: apiResult.currency,
                shop_name: apiResult.shop_name,
                rating: apiResult.rating,
                orders: apiResult.orders
            };
        }
    } catch (apiErr) {
        console.log("API fetch failed, falling back to scraping:", apiErr.message);
    }

    // Fallback to scraping - try multiple URL formats
    const urlsToTry = [
        `https://www.aliexpress.com/item/${productId}.html`,
        `https://www.aliexpress.us/item/${productId}.html`,
        `https://ar.aliexpress.com/item/${productId}.html`
    ];
    
    for (const productUrl of urlsToTry) {
        try {
            const res = await got(productUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                },
                timeout: { request: 15000 },
                followRedirect: true
            });

            const html = res.body;
            
            // Skip if 404 page
            if (html.includes('error/404') || html.includes('Page Not Found')) {
                continue;
            }
            
            let title = '';
            const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            if (titleMatch) {
                title = titleMatch[1].replace(/ - AliExpress.*$/i, '').replace(/\|.*$/i, '').trim();
            }
            
            // Try multiple image patterns
            let image_url = null;
            const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                                 html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
            if (ogImageMatch) {
                image_url = ogImageMatch[1];
            }
            if (!image_url) {
                const imgMatch = html.match(/"imageUrl":"([^"]+)"/) || html.match(/"mainImageUrl":"([^"]+)"/);
                if (imgMatch) image_url = imgMatch[1].replace(/\\u002F/g, '/');
            }

            // Try multiple price patterns
            let price = null;
            const pricePatterns = [
                /"formattedPrice":"([^"]+)"/,
                /"priceText":"([^"]+)"/,
                /"minPrice":"([^"]+)"/,
                /"salePrice":\{"formatedAmount":"([^"]+)"/,
                /"amount":"([^"]+)"/
            ];
            for (const pattern of pricePatterns) {
                const match = html.match(pattern);
                if (match) {
                    price = match[1];
                    break;
                }
            }

            if (title && title.length > 5 && !title.includes('AliExpress')) {
                console.log("Preview fetched via scraping - Title:", title.substring(0, 50));
                return {
                    title: title,
                    image_url: image_url || null,
                    price: price || "راجع الرابط"
                };
            }
        } catch (err) {
            console.log("Scraping attempt failed for", productUrl, "-", err.message);
        }
    }
    
    console.log("All scraping attempts failed, using fallback");
    return {
        title: `منتج AliExpress #${productId}`,
        image_url: null,
        price: "راجع الرابط"
    };
}


async function portaffFunction(cookie, ids) {

    const idObj = await idCatcher(ids);
    const productId = idObj?.id;

    if (!productId) throw new Error("❌ لم يتم استخراج Product ID.");

    const sourceTypes = {
        "555": "coin",
        "620": "point",
        "562": "super",
        "570": "limit",
        "561": "ther3"
    };

    let result = { aff: {}, previews: {} };
    let promoRequests = [];

    for (const type in sourceTypes) {
        const name = sourceTypes[type];

        const targetUrl = type === "561"
            ? `https://www.aliexpress.com/ssr/300000512/BundleDeals2?disableNav=YES&pha_manifest=ssr&_immersiveMode=true&productIds=${productId}&aff_fcid=`
            : type === "555"
                ? `https://m.aliexpress.com/p/coin-index/index.html?_immersiveMode=true&from=syicon&productIds=${productId}&aff_fcid=`
                : `https://star.aliexpress.com/share/share.htm?redirectUrl=https%3A%2F%2Fvi.aliexpress.com%2Fitem%2F${productId}.html%3FsourceType%3D${type === "620" ? '620%26channel%3Dcoin' : type}`;

        promoRequests.push(
            got("https://portals.aliexpress.com/tools/linkGenerate/generatePromotionLink.htm", {
                searchParams: {
                    trackId: "default",
                    targetUrl
                },
                headers: {
                    cookie: `xman_t=${cookie};`
                },
                responseType: "json"
            })
                .then(r => ({ type: name, data: r.body.data }))
                .catch(() => ({ type: name, data: null }))
        );
    }

    const promoResults = await Promise.all(promoRequests);

    for (const pr of promoResults) {
        if (pr.data && typeof pr.data === 'object') {
            result.aff[pr.type] = pr.data.promotionUrl || pr.data.couponUrl || pr.data.url || null;
        } else if (typeof pr.data === 'string') {
            result.aff[pr.type] = pr.data;
        } else {
            result.aff[pr.type] = null;
        }
    }

    result.previews = await fetchLinkPreview(productId);

    return result;
}
exports.portaffFunction = portaffFunction;
