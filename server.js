const express = require('express');
const cors = require('cors');
const path = require('path');
const { portaffFunction } = require('./afflink');
const { searchHotProducts, searchProducts } = require('./aliexpress-api');
const { Telegraf } = require('telegraf');
const { PostScheduler } = require('./scheduler');
const sharp = require('sharp');
const https = require('https');
const http = require('http');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const postScheduler = new PostScheduler();
postScheduler.start();

const geminiApiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
const model = genAI ? genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" }) : null;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Force no-cache
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Root route to ensure index.html is served
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ping endpoint for keep-alive
app.get('/ping', (req, res) => {
  const host = req.get('host');
  console.log(`📡 Ping received on ${host} at ${new Date().toLocaleString()}`);
  res.send('pong');
});

const fs = require('fs');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

app.post('/api/upload-frame', upload.single('frame'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
  const targetPath = path.join(__dirname, 'public', 'custom_frame.jpg');
  fs.rename(req.file.path, targetPath, (err) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true });
  });
});

async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

app.post('/api/frame-image', async (req, res) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) return res.status(400).json({ success: false, error: 'يرجى إرسال رابط الصورة' });

    const productImageBuffer = await downloadImage(imageUrl);
    const framePath = path.join(__dirname, 'public', 'frame.jpg');
    const customFramePath = path.join(__dirname, 'public', 'custom_frame.jpg');
    const useFramePath = fs.existsSync(customFramePath) ? customFramePath : framePath;
    
    const frameMetadata = await sharp(useFramePath).metadata();
    const frameWidth = frameMetadata.width;
    const frameHeight = frameMetadata.height;
    
    const innerLeft = Math.round(frameWidth * 0.05);
    const innerTop = Math.round(frameHeight * 0.05);
    const innerWidth = Math.round(frameWidth * 0.9);
    const innerHeight = Math.round(frameHeight * 0.7);
    
    const resizedProduct = await sharp(productImageBuffer)
      .resize(innerWidth, innerHeight, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .toBuffer();
    
    const framedImage = await sharp(useFramePath)
      .composite([{
        input: resizedProduct,
        left: innerLeft,
        top: innerTop,
        blend: 'over'
      }])
      .jpeg({ quality: 90 })
      .toBuffer();
    
    const base64Image = framedImage.toString('base64');
    res.json({ 
      success: true, 
      framedImage: `data:image/jpeg;base64,${base64Image}` 
    });
  } catch (error) {
    console.error('Frame error:', error);
    res.status(500).json({ success: false, error: 'فشل في إنشاء الصورة المؤطرة' });
  }
});

app.post('/api/affiliate', async (req, res) => {
  try {
    const { url, credentials } = req.body;
    const cookies = credentials?.cook || process.env.cook;
    if (!url) return res.status(400).json({ success: false, error: 'الرجاء إرسال رابط المنتج' });
    if (!cookies) return res.status(500).json({ success: false, error: 'الرجاء إدخال Cookie في الإعدادات' });

    const result = await portaffFunction(cookies, url);
    if (!result?.previews?.title) return res.status(400).json({ success: false, error: 'رابط غير صالح' });

    res.json({
      success: true,
      data: {
        title: result.previews.title,
        image: result.previews.image_url,
        price: result.previews.price,
        original_price: result.previews.original_price,
        discount: result.previews.discount,
        currency: result.previews.currency,
        shop_name: result.previews.shop_name,
        rating: result.previews.rating,
        orders: result.previews.orders,
        links: {
          coin: result.aff.coin,
          point: result.aff.point,
          super: result.aff.super,
          limit: result.aff.limit,
          bundle: result.aff.ther3
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'حدث خطأ' });
  }
});

app.post('/api/publish-telegram', async (req, res) => {
  try {
    const { title, price, link, coupon, image, settings, credentials } = req.body;
    const botToken = credentials?.telegramToken || process.env.TELEGRAM_BOT_TOKEN;
    let channelId1 = credentials?.channelId || process.env.TELEGRAM_CHANNEL_ID;
    let channelId2 = credentials?.channelId2 || '@AliOffers_Dz';
    const channelChoice = credentials?.channelChoice || '1';
    
    if (!botToken) return res.status(500).json({ success: false, error: 'الرجاء إدخال توكن البوت في الإعدادات' });
    
    function formatChannelId(id) {
      if (!id) return null;
      if (id.includes('t.me/')) {
        const match = id.match(/t\.me\/([^\/\?]+)/);
        if (match) return '@' + match[1];
      }
      if (!id.startsWith('@') && !id.startsWith('-')) return '@' + id;
      return id;
    }
    
    channelId1 = formatChannelId(channelId1);
    channelId2 = formatChannelId(channelId2);
    
    const s = settings || {
      prefix: '📢تخفيض لـ',
      salePrice: '✅السعر بعد التخفيض:',
      linkText: '📌رابط الشراء :',
      couponText: '🎁كوبون:',
      footer: '⚠️ لا تنس استخدام البوت الرسمي لـ AliOffersDz للحصول على أفضل العروض والتخفيضات من AliExpress 👇',
      botLink: '@AliOffersDZ_bot',
      hashtags: '#Aliexpress'
    };
    
    let message = `${s.prefix} ${title}\n\n`;
    message += `${s.salePrice} ${price}\n\n${s.linkText}\n${link}\n\n`;
    if (coupon) message += `${s.couponText} ${coupon}\n\n`;
    message += `${s.footer}\n🔗 ${s.botLink}\n\n${s.hashtags}`;
    
    // Use custom message if provided
    const finalMessage = req.body.customMessage || message;
    
    const bot = new Telegraf(botToken);
    
    let channels = [];
    if (channelChoice === '1' && channelId1) channels.push(channelId1);
    else if (channelChoice === '2' && channelId2) channels.push(channelId2);
    else if (channelChoice === 'both') {
      if (channelId1) channels.push(channelId1);
      if (channelId2) channels.push(channelId2);
    }
    
    if (channels.length === 0) return res.status(500).json({ success: false, error: 'الرجاء إدخال معرف القناة في الإعدادات' });
    
    for (const ch of channels) {
      if (image) {
        if (image.startsWith('data:image')) {
          const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
          const imageBuffer = Buffer.from(base64Data, 'base64');
          await bot.telegram.sendPhoto(ch, { source: imageBuffer }, { caption: finalMessage });
        } else {
          await bot.telegram.sendPhoto(ch, image, { caption: finalMessage });
        }
      } else {
        await bot.telegram.sendMessage(ch, finalMessage);
      }
    }
    
    res.json({ success: true, message: `تم النشر في ${channels.length} قناة` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Collections API
app.post('/api/publish-collection', async (req, res) => {
  try {
    const { message, credentials } = req.body;
    
    const botToken = credentials?.telegramToken || process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return res.status(400).json({ success: false, error: 'Bot token مطلوب' });
    
    const bot = new Telegraf(botToken);
    const channels = [];
    
    function formatChannelId(channelId) {
      if (!channelId) return null;
      channelId = channelId.trim();
      if (channelId.includes('t.me/')) {
        channelId = '@' + channelId.split('t.me/').pop().split('/')[0].split('?')[0];
      }
      if (!channelId.startsWith('@') && !channelId.startsWith('-')) {
        channelId = '@' + channelId;
      }
      return channelId;
    }
    
    if (credentials.channelChoice === '1' || credentials.channelChoice === 'both') {
      if (credentials.channelId) channels.push(formatChannelId(credentials.channelId));
    }
    if (credentials.channelChoice === '2' || credentials.channelChoice === 'both') {
      if (credentials.channelId2) channels.push(formatChannelId(credentials.channelId2));
    }
    
    if (channels.length === 0) return res.status(500).json({ success: false, error: 'الرجاء إدخال معرف القناة في الإعدادات' });
    
    for (const ch of channels) {
      await bot.telegram.sendMessage(ch, message);
    }
    
    res.json({ success: true, message: `تم النشر في ${channels.length} قناة` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Scheduling API
app.post('/api/schedule-post', (req, res) => {
  try {
    const { message, image, scheduledTime, credentials } = req.body;
    
    if (!scheduledTime) {
      return res.status(400).json({ success: false, error: 'يرجى تحديد وقت النشر' });
    }
    
    const post = postScheduler.addPost({
      message,
      image,
      scheduledTime,
      credentials
    });
    
    res.json({ success: true, post });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Simple title cleanup function (fallback when AI is unavailable)
function cleanupTitle(title) {
  let cleaned = title
    .replace(/\s+/g, ' ')
    .replace(/[,]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  
  // Remove common AliExpress junk patterns
  const junkPatterns = [
    /\bfor\s+(men|women|kids|boys|girls|ladies)\b/gi,
    /\b(new|hot|sale|2024|2025|2026)\b/gi,
    /\b(high quality|free shipping|fast shipping)\b/gi,
    /\d+\s*(pcs|pieces|pack|set)\b/gi,
  ];
  
  junkPatterns.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '').trim();
  });
  
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
  
  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  
  return cleaned;
}

app.post('/api/ai-refine-title', async (req, res) => {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'العنوان مطلوب' });

    // Re-check for API key in case it was just added to environment
    const currentApiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    
    // Local model instance to ensure we use the latest env vars
    let localModel = model;
    if (!localModel && currentApiKey) {
      const localGenAI = new GoogleGenerativeAI(currentApiKey);
      localModel = localGenAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    }

    // If no AI model available, use simple cleanup
    if (!localModel) {
      const cleanedTitle = cleanupTitle(title);
      return res.json({ success: true, refinedTitle: cleanedTitle, method: 'fallback' });
    }

    try {
      const prompt = `You are a professional marketing expert specialized in AliExpress deals for the Algerian market.
Your task is to refine the product title to be more attractive, professional, and engaging for Telegram channel users.

CRITICAL RULES:
1. Keep the output in the EXACT SAME LANGUAGE as the input title.
2. Remove junk words (e.g., Global Version, 2024, 2025, Free Shipping, AliExpress, etc.).
3. Focus on the core product name and its most important feature.
4. Keep it concise (max 7-10 words).
5. Do NOT add emojis.
6. Only return the refined title text.

Input title: ${title}`;
      
      const result = await localModel.generateContent(prompt);
      const response = await result.response;
      const refinedTitle = response.text().trim();

      // NEW: Generate hook in the same request to save quota and time
      let hook = "";
      try {
        const hookPrompt = `Write ONE short, catchy opening line (hook) in Algerian Darija (Arabic script) for this product: ${refinedTitle}. No emojis, one line only.`;
        const hookResult = await localModel.generateContent(hookPrompt);
        hook = hookResult.response.text().trim();
      } catch (e) {
        hook = fallbackHooks[Math.floor(Math.random() * fallbackHooks.length)];
      }

      res.json({ success: true, refinedTitle: refinedTitle || title, hook: hook, method: 'ai' });
    } catch (aiError) {
      // If AI fails (quota exceeded, etc.), use fallback
      console.log('AI failed, using fallback:', aiError.message);
      const cleanedTitle = cleanupTitle(title);
      res.json({ success: true, refinedTitle: cleanedTitle, method: 'fallback' });
    }
  } catch (error) {
    console.error('Refine error:', error.message || error);
    // Even on error, try to return something useful
    const cleanedTitle = cleanupTitle(req.body.title || '');
    if (cleanedTitle) {
      res.json({ success: true, refinedTitle: cleanedTitle, method: 'fallback' });
    } else {
      res.status(500).json({ success: false, error: 'فشل تحسين العنوان' });
    }
  }
});

// Generate Algerian-style hook/intro for product
app.post('/api/generate-algerian-hook', async (req, res) => {
  try {
    const { title, price } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'العنوان مطلوب' });

    const currentApiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    
    let localModel = model;
    if (!localModel && currentApiKey) {
      const localGenAI = new GoogleGenerativeAI(currentApiKey);
      localModel = localGenAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    }

    // Fallback hooks if AI is not available - extensive list for variety
    const fallbackHooks = [
      "يا خاوتي شوفو هاد لافير الخطيرة!",
      "سلعة هبال وسومة ما تتفوتش!",
      "لافير تاع الصح، غير بروفيتيو!",
      "عرض خاص لخاوتنا، ما تفوتوهش!",
      "جبتلكم عرض هايل اليوم!",
      "والله سلعة تستاهل، شوفوها!",
      "لقيتلكم حاجة مليحة بزاف!",
      "هاد العرض راه يسوى، ما تتردوش!",
      "سومة هابطة وجودة عالية، واش تستناو!",
      "عرض ما يتفوتش، غير كليكيو!",
      "جات فرصة مليحة لخاوتنا!",
      "شوفو واش لقيت، راه يستاهل!",
      "هادي سلعة نار بسعر هايل!",
      "لافير قوية اليوم، ما تفوتكمش!",
      "والله عجبتني هاد السلعة، لازم نشاركها معاكم!",
      "سعر خيالي وجودة تاع الصح!",
      "هاذي الفرصة لي كنتو تستناو فيها!",
      "منتج هايل بسومة معقولة بزاف!",
      "شوفو هاد لافير قبل ما تخلص!",
      "جبتلكم حاجة تهبل، غير طلو!",
      "عرض اليوم راه خطير، ما تتأخروش!",
      "لقيتلكم كنز اليوم، شوفوه!",
      "هادي فرصة ذهبية، ما تضيعوهاش!",
      "سلعة ممتازة وسومتها في المتناول!",
      "راني نوصيكم بهاد المنتج، يستاهل!"
    ];

    if (!localModel) {
      const randomHook = fallbackHooks[Math.floor(Math.random() * fallbackHooks.length)];
      return res.json({ success: true, hook: randomHook, method: 'fallback' });
    }

    try {
      const prompt = `You are an Algerian marketing expert who writes in Algerian Darija (الدارجة الجزائرية).
Your task is to write ONE short, catchy opening line (hook) for a Telegram post about this product.

RULES:
1. Write ONLY in Algerian Darija using Arabic letters.
2. Make it friendly and exciting, like you're telling a friend about a great deal.
3. Use common Algerian expressions like: "يا خاوتي", "لافير", "سلعة هبال", "سومة هابطة", "ما تتفوتش", "بروفيتيو".
4. Keep it to ONE line only (max 10 words).
5. Do NOT include the product name or price in the hook.
6. Do NOT add emojis.
7. Return ONLY the hook text, nothing else.

Product: ${title}
${price ? `Price: ${price}` : ''}`;
      
      const result = await localModel.generateContent(prompt);
      const response = await result.response;
      const hook = response.text().trim();

      res.json({ success: true, hook: hook, method: 'ai' });
    } catch (aiError) {
      console.log('AI hook failed, using fallback:', aiError.message);
      const randomHook = fallbackHooks[Math.floor(Math.random() * fallbackHooks.length)];
      res.json({ success: true, hook: randomHook, method: 'fallback' });
    }
  } catch (error) {
    console.error('Hook generation error:', error.message || error);
    res.status(500).json({ success: false, error: 'فشل إنشاء المقدمة' });
  }
});

app.get('/api/scheduled-posts', (req, res) => {
  const posts = postScheduler.getAllPosts();
  res.json({ success: true, posts });
});

app.delete('/api/scheduled-posts/:id', (req, res) => {
  postScheduler.removePost(req.params.id);
  res.json({ success: true });
});

const algerianCategories = {
  'electronics': { id: '44', nameAr: 'إلكترونيات', keywords: ['phone accessories', 'earbuds', 'smartwatch', 'power bank'] },
  'fashion': { id: '3', nameAr: 'أزياء', keywords: ['dress', 'jacket', 'shoes', 'bags'] },
  'home': { id: '15', nameAr: 'منزل ومطبخ', keywords: ['kitchen gadgets', 'home decor', 'organizer', 'storage'] },
  'beauty': { id: '66', nameAr: 'جمال وعناية', keywords: ['makeup', 'skincare', 'hair tools', 'perfume'] },
  'kids': { id: '1501', nameAr: 'أطفال وألعاب', keywords: ['toys', 'educational', 'baby items', 'games'] },
  'sports': { id: '18', nameAr: 'رياضة', keywords: ['fitness', 'outdoor', 'camping', 'cycling'] }
};

app.post('/api/discover-products', async (req, res) => {
  try {
    const { category, keywords, minPrice, maxPrice, limit, useAI } = req.body;
    
    const searchOptions = {
      limit: limit || '10',
      minPrice: minPrice || '1',
      maxPrice: maxPrice || '50'
    };

    if (category && algerianCategories[category]) {
      searchOptions.category = algerianCategories[category].id;
    }
    if (keywords) {
      searchOptions.keywords = keywords;
    }

    const result = await searchHotProducts(searchOptions);
    
    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error || 'فشل البحث عن المنتجات' });
    }

    let products = result.products || [];

    if (useAI && products.length > 0) {
      const currentApiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
      
      if (currentApiKey) {
        try {
          const localGenAI = new GoogleGenerativeAI(currentApiKey);
          const localModel = localGenAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
          
          const productTitles = products.slice(0, 5).map((p, i) => `${i+1}. ${p.title} - ${p.price} ${p.currency}`).join('\n');
          
          const prompt = `أنت خبير تسويق متخصص في السوق الجزائري.
من بين هذه المنتجات، رتبها حسب جاذبيتها للمستهلك الجزائري (من الأكثر جاذبية للأقل):

${productTitles}

أعطني فقط أرقام المنتجات مرتبة (مثلاً: 2,1,4,3,5) بدون أي شرح.`;
          
          const aiResult = await localModel.generateContent(prompt);
          const ranking = aiResult.response.text().trim();
          const order = ranking.match(/\d+/g);
          
          if (order && order.length > 0) {
            const reorderedProducts = [];
            order.forEach(idx => {
              const index = parseInt(idx) - 1;
              if (index >= 0 && index < products.length && products[index]) {
                reorderedProducts.push({ ...products[index], aiRanked: true });
              }
            });
            products.forEach(p => {
              if (!reorderedProducts.find(rp => rp.id === p.id)) {
                reorderedProducts.push(p);
              }
            });
            products = reorderedProducts;
          }
        } catch (aiError) {
          console.log('AI ranking failed:', aiError.message);
        }
      }
    }

    res.json({ 
      success: true, 
      total: result.total,
      products: products
    });
  } catch (error) {
    console.error('Discover products error:', error);
    res.status(500).json({ success: false, error: 'حدث خطأ في البحث' });
  }
});

app.post('/api/ai-suggest-keywords', async (req, res) => {
  try {
    const { category, season } = req.body;
    
    const currentApiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    
    if (!currentApiKey) {
      const defaultKeywords = {
        'electronics': ['سماعات بلوتوث', 'شاحن سريع', 'ساعة ذكية', 'باور بانك'],
        'fashion': ['فساتين صيفية', 'أحذية رياضية', 'حقائب يد', 'نظارات شمسية'],
        'home': ['أدوات مطبخ', 'ديكور منزلي', 'منظمات', 'إضاءة LED'],
        'beauty': ['مكياج', 'عناية بالبشرة', 'عطور', 'أدوات شعر'],
        'kids': ['ألعاب تعليمية', 'ملابس أطفال', 'ألعاب إلكترونية'],
        'sports': ['أجهزة رياضية', 'ملابس رياضية', 'معدات تخييم']
      };
      
      return res.json({ 
        success: true, 
        keywords: defaultKeywords[category] || ['trending', 'best seller', 'hot deals'],
        method: 'fallback'
      });
    }

    const localGenAI = new GoogleGenerativeAI(currentApiKey);
    const localModel = localGenAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    
    const categoryName = algerianCategories[category]?.nameAr || category || 'منتجات عامة';
    const seasonText = season || 'الموسم الحالي';
    
    const prompt = `أنت خبير تسويق أفلييت متخصص في السوق الجزائري.
اقترح 5 كلمات بحث (Keywords) بالإنجليزية للبحث في AliExpress عن منتجات في فئة "${categoryName}" تناسب ${seasonText} وتحقق مبيعات عالية في الجزائر.

أعطني الكلمات فقط مفصولة بفاصلة، بدون أرقام أو شرح.`;
    
    const result = await localModel.generateContent(prompt);
    const keywordsText = result.response.text().trim();
    const keywords = keywordsText.split(',').map(k => k.trim()).filter(k => k.length > 0);
    
    res.json({ success: true, keywords, method: 'ai' });
  } catch (error) {
    console.error('AI suggest keywords error:', error);
    res.status(500).json({ success: false, error: 'فشل اقتراح الكلمات' });
  }
});

app.post('/api/analyze-product', async (req, res) => {
  try {
    const { title, price, category } = req.body;
    
    const currentApiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    
    if (!currentApiKey) {
      return res.json({ 
        success: true, 
        analysis: {
          score: 7,
          pros: ['سعر مناسب', 'منتج مطلوب'],
          hook: 'يا خاوتي شوفو هاد لافير الخطيرة!'
        },
        method: 'fallback'
      });
    }

    const localGenAI = new GoogleGenerativeAI(currentApiKey);
    const localModel = localGenAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    
    const prompt = `أنت خبير تسويق جزائري. حلل هذا المنتج للسوق الجزائري:

المنتج: ${title}
السعر: ${price}

أعطني:
1. نقطة من 10 لجاذبية المنتج للجزائريين
2. ميزتين رئيسيتين بالدارجة الجزائرية (قصيرة جداً)
3. Hook تسويقي قصير بالدارجة الجزائرية

أجب بصيغة JSON فقط:
{"score": 8, "pros": ["ميزة 1", "ميزة 2"], "hook": "النص"}`;
    
    const result = await localModel.generateContent(prompt);
    const responseText = result.response.text().trim();
    
    let analysis;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch (e) {
      analysis = {
        score: 7,
        pros: ['منتج جيد', 'سعر معقول'],
        hook: 'عرض ما يتفوتش، غير كليكيو!'
      };
    }
    
    res.json({ success: true, analysis, method: 'ai' });
  } catch (error) {
    console.error('Analyze product error:', error);
    res.status(500).json({ success: false, error: 'فشل تحليل المنتج' });
  }
});

app.get('/api/categories', (req, res) => {
  const categories = Object.entries(algerianCategories).map(([key, value]) => ({
    id: key,
    name: value.nameAr,
    aliexpressId: value.id
  }));
  res.json({ success: true, categories });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});
