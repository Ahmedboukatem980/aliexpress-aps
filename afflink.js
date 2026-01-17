const got = require("got");
const { URL } = require("url");
const { getProductDetails } = require('./aliexpress-api');


async function getFinalRedirect(url, maxRedirects = 10) {
    let currentUrl = url;
    let bestUrl = url;
    
    // Specific handling for s.click.aliexpress.com which often uses meta-refresh or JS redirects
    if (url.includes('s.click.aliexpress.com')) {
        try {
            const response = await got(url, {
                followRedirect: true,
                https: { rejectUnauthorized: false },
                timeout: { request: 15000 },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
                }
            });
            currentUrl = response.url;
            bestUrl = currentUrl;
        } catch (err) {
            console.error("❌ Initial redirect error:", err.message);
        }
    }

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

        // 4) روابط الجوال m.aliexpress.com/item/xxxx.html
        const m3 = u.pathname.match(/\/(\d+)\.html/);
        if (m3) return m3[1];

        // 5) روابط البحث أو التصنيفات التي تحتوي على رقم المنتج في المسار
        const m4 = url.match(/\/(\d{10,})\.html/);
        if (m4) return m4[1];

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
    // 1. microlink.io API
    try {
        console.log("Trying microlink.io API...");
        const apiRes = await got('https://api.microlink.io', {
            searchParams: { url: `https://m.aliexpress.com/item/${productId}.html` },
            responseType: 'json',
            timeout: { request: 20000 }
        });
        const data = apiRes.body;
        if (data.status === 'success' && data.data) {
            let title = (data.data.title || '').replace(/ - AliExpress.*$/i, '').replace(/\s*-\s*AliExpress\s*\d*$/i, '').trim();
            if (title.length > 10 && !title.includes('AliExpress') && !title.includes('Smarter Shopping')) {
                console.log("✅ Product fetched via microlink.io");
                return { title, image_url: data.data.image?.url || null, price: "راجع الرابط", fetch_method: "microlink.io" };
            }
        }
    } catch (err) { console.log("microlink.io failed:", err.message); }

    // 2. linkpreview.xyz API
    try {
        console.log("Trying linkpreview.xyz API...");
        const lpRes = await got("https://linkpreview.xyz/api/get-meta-tags", {
            searchParams: { url: `https://www.aliexpress.com/item/${productId}.html` },
            responseType: "json",
            timeout: { request: 15000 }
        });
        if (lpRes.body && (lpRes.body.title || lpRes.body.image)) {
            console.log("✅ Product fetched via linkpreview.xyz");
            let title = (lpRes.body.title || `منتج AliExpress #${productId}`).replace(/ - AliExpress.*$/i, '').replace(/\|.*$/i, '').replace('AliExpress', '').trim();
            return { title, image_url: lpRes.body.image || null, price: "راجع الرابط", fetch_method: "linkpreview.xyz" };
        }
    } catch (err) { console.log("linkpreview.xyz failed:", err.message); }

    // 3. API (AliExpress API)
    try {
        console.log("Trying AliExpress API...");
        const apiResult = await getProductDetails(productId);
        if (apiResult && apiResult.title) {
            console.log("✅ Product fetched via AliExpress API");
            return {
                title: apiResult.title,
                image_url: apiResult.image_url,
                price: apiResult.sale_price || apiResult.price || "غير متوفر",
                original_price: apiResult.original_price,
                discount: apiResult.discount,
                currency: apiResult.currency,
                shop_name: apiResult.shop_name,
                rating: apiResult.rating,
                orders: apiResult.orders,
                fetch_method: "API"
            };
        }
    } catch (err) { console.log("AliExpress API failed:", err.message); }

    // 4. Preview fetched via scraping
    const urlsToTry = [`https://www.aliexpress.com/item/${productId}.html`, `https://ar.aliexpress.com/item/${productId}.html` ];
    for (const productUrl of urlsToTry) {
        try {
            const res = await got(productUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: { request: 20000 },
                followRedirect: true
            });
            const html = res.body;
            if (html.includes('error/404')) continue;
            
            let title = '';
            const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            if (titleMatch) title = titleMatch[1].replace(/ - AliExpress.*$/i, '').replace(/\|.*$/i, '').trim();

            const jsonPatterns = [/window\.runParams\s*=\s*(\{.+?\});/s, /window\.detailData\s*=\s*(\{.+?\});/s];
            for (const pattern of jsonPatterns) {
                const match = html.match(pattern);
                if (match) {
                    try {
                        let jsonStr = match[1];
                        if (jsonStr.lastIndexOf('}') !== jsonStr.length - 1) jsonStr = jsonStr.substring(0, jsonStr.lastIndexOf('}') + 1);
                        const jsonData = JSON.parse(jsonStr);
                        const itemDetail = jsonData.productInfoComponent || jsonData.data?.productInfoComponent || jsonData.item;
                        if (itemDetail) return {
                            title: itemDetail.subject || itemDetail.title || title,
                            image_url: itemDetail.mainImage || itemDetail.image || null,
                            price: itemDetail.price || "راجع الرابط",
                            fetch_method: "Preview fetched via scraping"
                        };
                    } catch (e) {}
                }
            }
        } catch (err) {}
    }
    
    return { title: `منتج AliExpress #${productId}`, image_url: null, price: "راجع الرابط", fetch_method: "None" };
}


async function portaffFunction(cookie, ids) {

    const idObj = await idCatcher(ids);
    const productId = idObj?.id;

    if (!productId) throw new Error("❌ لم يتم استخراج Product ID.");

    // Handle cookie format - user might provide just the value or include xman_t=
    let cookieStr = cookie.trim();
    if (cookieStr.includes('xman_t=')) {
        // Extract the xman_t value from the full cookie string
        const match = cookieStr.match(/xman_t=([^;]+)/);
        if (match) {
            cookieStr = `xman_t=${match[1]};`;
        }
    } else {
        cookieStr = `xman_t=${cookieStr};`;
    }
    
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
                    cookie: cookieStr
                },
                responseType: "json"
            })
                .then(r => ({ type: name, data: r.body.data }))
                .catch(() => ({ type: name, data: null }))
        );
    }

    const promoResults = await Promise.all(promoRequests);

    console.log("Cookie used for generation:", cookieStr.substring(0, 20) + "...");

    for (const pr of promoResults) {
        if (pr.data && typeof pr.data === 'object') {
            console.log(`Generated ${pr.type} link:`, pr.data.promotionUrl ? "Success" : "Failed/Empty");
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
