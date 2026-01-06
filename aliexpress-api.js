const crypto = require('crypto');
const got = require('got');

const API_URL = 'https://api-sg.aliexpress.com/sync';

function signRequest(params, appSecret) {
    const sortedParams = Object.keys(params)
        .sort()
        .reduce((acc, key) => {
            acc[key] = params[key];
            return acc;
        }, {});

    const sortedString = Object.keys(sortedParams).reduce((acc, key) => {
        return `${acc}${key}${sortedParams[key]}`;
    }, '');

    const signString = `${appSecret}${sortedString}${appSecret}`;

    return crypto
        .createHash('md5')
        .update(signString, 'utf8')
        .digest('hex')
        .toUpperCase();
}

async function getProductDetails(productId, options = {}) {
    if (!productId) return null;
    
    // Add small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1100));

    const appKey = process.env.ALIEXPRESS_APP_KEY;
    const appSecret = process.env.ALIEXPRESS_APP_SECRET;

    if (!appKey || !appSecret) {
        console.error('Missing AliExpress API credentials');
        return null;
    }

    const params = {
        method: 'aliexpress.affiliate.productdetail.get',
        app_key: appKey,
        sign_method: 'md5',
        timestamp: Date.now().toString(),
        format: 'json',
        v: '2.0',
        product_ids: String(productId),
        target_currency: options.currency || 'USD',
        target_language: options.language || 'EN',
        tracking_id: options.trackingId || 'default'
    };

    params.sign = signRequest(params, appSecret);

    try {
        const response = await got(API_URL, {
            searchParams: params,
            timeout: { request: 15000 },
            responseType: 'json'
        });

        const data = response.body;
        
        console.log('AliExpress API Response:', JSON.stringify(data).substring(0, 200));

        if (data.aliexpress_affiliate_productdetail_get_response) {
            const result = data.aliexpress_affiliate_productdetail_get_response.resp_result;
            if (result && result.result && result.result.products && result.result.products.product) {
                const products = result.result.products.product;
                const product = Array.isArray(products) ? products[0] : products;
                
                return {
                    title: product.product_title || '',
                    image_url: product.product_main_image_url || product.product_small_image_urls?.string?.[0] || null,
                    price: product.target_sale_price || product.target_original_price || null,
                    original_price: product.target_original_price || null,
                    sale_price: product.target_sale_price || null,
                    discount: product.discount || null,
                    currency: product.target_sale_price_currency || 'USD',
                    product_url: product.product_detail_url || null,
                    promotion_link: product.promotion_link || null,
                    shop_name: product.shop_title || null,
                    rating: product.evaluate_rate || null,
                    orders: product.lastest_volume || null
                };
            }
        }

        if (data.error_response) {
            console.error('AliExpress API Error:', data.error_response.msg || JSON.stringify(data.error_response));
        }

        return null;
    } catch (err) {
        console.error('AliExpress API request error:', err.message);
        return null;
    }
}

module.exports = { getProductDetails };
