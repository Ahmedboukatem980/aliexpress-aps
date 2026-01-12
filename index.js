const { Telegraf } = require('telegraf');
const express = require('express');
const https = require('https');
const app = express();
const { portaffFunction } = require('./afflink');

// 

const bot = new Telegraf(process.env.token);
const cookies = process.env.cook;
const Channel =process.env.Channel;

app.use(express.json());
app.use(bot.webhookCallback('/bot'));

app.get('/', (req, res) => res.sendStatus(200));
app.get('/ping', (req, res) =>
  res.status(200).json({ message: 'Ping successful' })
);

/* -------------------- KEEP ALIVE -------------------- */
function keepAppRunning() {
  const baseUrl = process.env.RENDER_EXTERNAL_URL || `https://${process.env.REPLIT_DEV_DOMAIN}`;
  setInterval(() => {
    https
      .get(`${baseUrl}/bot`)
      .on('error', () => console.log('Ping failed'));
  }, 5 * 60 * 1000);
}

/* -------------------- SAFE SEND -------------------- */
async function safeSend(ctx, fn) {
  try {
    return await fn(); 
  } catch (err) {
    if (err.code === 403) {
      console.log(`🚫 User ${ctx.chat?.id} blocked the bot`);
      return null;
    } else {
      console.error(err);
      throw err;
    }
  }
}


/* -------------------- CHECK SUBSCRIPTION -------------------- */
async function isUserSubscribed(userId) {
  try {
    const idChannel = Channel.replace('https://t.me/', '@');
    const member = await bot.telegram.getChatMember(idChannel, userId);
    return ['member', 'administrator', 'creator'].includes(member.status);
  } catch (e) {
    return false;
  }
}

/* -------------------- /start & /help -------------------- */
bot.command(['start', 'help'], async (ctx) => {
  const replyMarkup = {
    inline_keyboard: [[{ text: 'اشترك في القناة 📢', url: Channel }]],
  };

  const welcomeMessage = `
مرحبا بك معنا، كل ما عليك الان هو إرسال لنا رابط 
المنتج التي تريد شرائه وسنقوم بتوفير لك أعلى نسبة خصم العملات 
👌 أيضا عروض اخرى للمنتج بأسعار ممتازة،

    `;

  await safeSend(ctx, () =>
    ctx.reply(welcomeMessage, { reply_markup: replyMarkup })
  );
});

/* -------------------- TEXT HANDLER -------------------- */
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;

  const subscribed = await isUserSubscribed(userId);

  /* -------- NOT SUBSCRIBED -------- */
  if (!subscribed) {
    const replyMarkup = {
      inline_keyboard: [[{ text: 'اشترك الآن ✅', url: Channel }]],
    };

    await safeSend(ctx, () =>
      ctx.reply(
        '⚠️ أنت غير مشترك في القناة. يرجى الاشتراك أولًا:',
        { reply_markup: replyMarkup }
      )
    );
    return;
  }

  /* -------- INVALID LINK -------- */
  if (!text.includes('aliexpress.com')) {
    await safeSend(ctx, () =>
      ctx.reply('🚫 الرجاء إرسال رابط من AliExpress فقط.')
    );
    return;
  }

  /* -------- PROCESS LINK -------- */
  const sent = await safeSend(ctx, () =>
    ctx.reply('⏳ جاري البحث عن أفضل العروض 🔍')
  );

  try {
    const urlPattern =
      /https?:\/\/(?:[^\s]+)/i;
    const links = text.match(urlPattern);

    if (!links) {
      await safeSend(ctx, () =>
        ctx.reply('🚨 لم يتم العثور على رابط صحيح')
      );
      return;
    }

    const coinPi = await portaffFunction(cookies, links[0]);

    if (!coinPi?.previews?.image_url) {
      await safeSend(ctx, () =>
        ctx.reply('🚨 البوت يدعم فقط روابط منتجات AliExpress')
      );
      return;
    }

    await safeSend(ctx, () =>
      ctx.replyWithPhoto(
        { url: coinPi.previews.image_url },
        {
          caption: `
${coinPi.previews.title}

&lt;blockquote&gt;${coinPi.previews.hook || 'يا خاوتي شوفو هاد لافير الخطيرة!'}&lt;/blockquote&gt;

<b>🎉 روابط التخفيض</b>

🔹 تخفيض العملات:
${coinPi.aff.coin}

🔹 العملات:
${coinPi.aff.point}

🔹 السوبر ديلز:
${coinPi.aff.super}

🔹 العرض المحدود:
${coinPi.aff.limit}

🔹 Bundle deals:
${coinPi.aff.ther3}

⚠️ غيّر البلد إلى كندا 🇨🇦
`,
          parse_mode: 'HTML',
       }).then(() => {
             ctx.deleteMessage(sent.message_id);
        })
      
    );

  } catch (e) {
    await safeSend(ctx, () =>
      ctx.reply('❗ حدث خطأ أثناء معالجة الرابط')
    );
  }
});

/* -------------------- GLOBAL ERROR HANDLER -------------------- */
bot.catch((err, ctx) => {
  if (err.code === 403) {
    console.log(`🚫 Blocked by user: ${ctx.chat?.id}`);
    return;
  }
  console.error('Unhandled error:', err);
});

/* -------------------- SERVER -------------------- */
const PORT = process.env.PORT || 5000;
const baseUrl = process.env.RENDER_EXTERNAL_URL || `https://${process.env.REPLIT_DEV_DOMAIN}`;

app.listen(PORT, '0.0.0.0', () => {
  bot.telegram
    .setWebhook(`${baseUrl}/bot`)
    .then(() => {
      console.log(`✅ Webhook set & server running on port ${PORT}`);
      keepAppRunning();
    });
});

