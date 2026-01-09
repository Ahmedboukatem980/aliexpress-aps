const express = require('express');
const cors = require('cors');
const path = require('path');
const { portaffFunction } = require('./afflink');
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
const model = genAI ? genAI.getGenerativeModel({ model: "gemini-2.0-flash" }) : null;

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
      localModel = localGenAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    }

    if (!localModel) {
      console.error('Refine error: GEMINI_API_KEY not configured');
      return res.status(500).json({ success: false, error: 'مفتاح API غير متوفر - يرجى إضافة GEMINI_API_KEY' });
    }

    const prompt = `You are a helpful marketing assistant. Your task is to refine product titles from AliExpress to be more attractive and professional while keeping them in the SAME LANGUAGE as the input. Keep the output concise and engaging. Only return the refined title. Input title: ${title}`;
    
    const result = await localModel.generateContent(prompt);
    const response = await result.response;
    const refinedTitle = response.text().trim();

    res.json({ success: true, refinedTitle: refinedTitle || title });
  } catch (error) {
    console.error('Refine error:', error.message || error);
    res.status(500).json({ success: false, error: `فشل تحسين العنوان: ${error.message || 'خطأ غير معروف'}` });
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});
