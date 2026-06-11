// api/bot.js
// Telegram bot webhook — receives messages and updates portfolio
// Vercel serverless function

const https   = require('https')
const storage = {}  // In-memory fallback — use KV in production

// ── Simple KV store using a free JSONbin ──
// We store works as JSON array in JSONbin (free, no signup needed for basic)
const JSONBIN_URL = process.env.JSONBIN_URL || ''
const BOT_TOKEN   = process.env.BOT_TOKEN   || ''
const ADMIN_ID    = process.env.ADMIN_ID    || ''  // your Telegram user ID

async function getWorks() {
  if (!JSONBIN_URL) return []
  try {
    const r = await fetch(JSONBIN_URL + '/latest', {
      headers: { 'X-Master-Key': process.env.JSONBIN_KEY || '' }
    })
    const d = await r.json()
    return d.record?.works || []
  } catch { return [] }
}

async function saveWorks(works) {
  if (!JSONBIN_URL) return false
  try {
    await fetch(JSONBIN_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': process.env.JSONBIN_KEY || ''
      },
      body: JSON.stringify({ works })
    })
    return true
  } catch { return false }
}

async function sendMessage(chatId, text, keyboard = null) {
  const body = { chat_id: chatId, text, parse_mode: 'HTML' }
  if (keyboard) body.reply_markup = { inline_keyboard: keyboard }
  
  return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

async function getFileUrl(fileId) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`)
    const d = await r.json()
    return `https://api.telegram.org/file/bot${BOT_TOKEN}/${d.result.file_path}`
  } catch { return null }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') return res.status(200).send('OK')

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const msg  = body?.message || body?.callback_query?.message

  if (!msg) return res.status(200).send('OK')

  const chatId   = msg.chat.id
  const userId   = msg.from?.id?.toString()
  const text     = msg.text || ''
  const caption  = msg.caption || ''
  const photo    = msg.photo

  // Security — only admin can update
  const isAdmin = !ADMIN_ID || userId === ADMIN_ID

  // ── /start ──
  if (text === '/start') {
    await sendMessage(chatId,
      `<b>👋 Karios Agency Bot</b>\n\n` +
      `Update your website by sending me content.\n\n` +
      `<b>Commands:</b>\n` +
      `/addwork — Add a new portfolio item\n` +
      `/listworks — See all portfolio items\n` +
      `/deletework — Remove a portfolio item\n` +
      `/help — Show this menu\n\n` +
      `<b>Quick add:</b>\n` +
      `Send a photo with caption:\n` +
      `<code>Title | Tag | Result1 | Result2</code>\n\n` +
      `Example:\n` +
      `<code>Fashion Store Nigeria | SEO Fix | 0→12 sales | +340% traffic</code>`
    )
    return res.status(200).send('OK')
  }

  // ── /help ──
  if (text === '/help') {
    await sendMessage(chatId,
      `<b>How to add work to your website:</b>\n\n` +
      `1. Send a photo\n` +
      `2. In the caption write:\n` +
      `<code>Store Name | Service Type | Result 1 | Result 2</code>\n\n` +
      `<b>Example:</b>\n` +
      `<code>Beauty Brand SA | Product Research | 3/3 products sold | $20/wk</code>\n\n` +
      `The work card will appear on your website instantly! 🚀`
    )
    return res.status(200).send('OK')
  }

  // ── /listworks ──
  if (text === '/listworks') {
    const works = await getWorks()
    if (!works.length) {
      await sendMessage(chatId, 'No works added yet. Send a photo with caption to add one!')
      return res.status(200).send('OK')
    }
    let list = `<b>Your portfolio (${works.length} items):</b>\n\n`
    works.forEach((w, i) => {
      list += `${i+1}. <b>${w.title}</b> — ${w.tag}\n`
    })
    list += `\nUse /deletework to remove one.`
    await sendMessage(chatId, list)
    return res.status(200).send('OK')
  }

  // ── /deletework ──
  if (text === '/deletework') {
    if (!isAdmin) { await sendMessage(chatId, '❌ Not authorised.'); return res.status(200).send('OK') }
    const works = await getWorks()
    if (!works.length) {
      await sendMessage(chatId, 'No works to delete.')
      return res.status(200).send('OK')
    }
    const keyboard = works.map((w, i) => [{
      text: `🗑 ${w.title}`,
      callback_data: `delete_${i}`
    }])
    await sendMessage(chatId, 'Which work do you want to remove?', keyboard)
    return res.status(200).send('OK')
  }

  // ── Handle delete callback ──
  if (body?.callback_query) {
    const data    = body.callback_query.data
    const cbChatId = body.callback_query.message.chat.id
    if (data.startsWith('delete_')) {
      const idx   = parseInt(data.replace('delete_', ''))
      const works = await getWorks()
      if (idx >= 0 && idx < works.length) {
        const removed = works.splice(idx, 1)[0]
        await saveWorks(works)
        await sendMessage(cbChatId, `✅ Removed: <b>${removed.title}</b>\nWebsite updated!`)
      }
    }
    return res.status(200).send('OK')
  }

  // ── Photo with caption = add work ──
  if (photo && caption) {
    if (!isAdmin) { await sendMessage(chatId, '❌ Not authorised.'); return res.status(200).send('OK') }

    const parts   = caption.split('|').map(s => s.trim())
    const title   = parts[0] || 'New Work'
    const tag     = parts[1] || 'Project'
    const result1 = parts[2] || ''
    const result2 = parts[3] || ''

    // Get highest quality photo
    const fileId  = photo[photo.length - 1].file_id
    const imgUrl  = await getFileUrl(fileId)

    const works   = await getWorks()
    const newWork = {
      id:      Date.now(),
      title,
      tag,
      result1,
      result2,
      imgUrl,
      addedAt: new Date().toISOString()
    }
    works.unshift(newWork)  // Add to front
    const saved = await saveWorks(works)

    if (saved) {
      await sendMessage(chatId,
        `✅ <b>Added to your website!</b>\n\n` +
        `📌 <b>${title}</b>\n` +
        `🏷 ${tag}\n` +
        (result1 ? `📊 ${result1}\n` : '') +
        (result2 ? `📊 ${result2}\n` : '') +
        `\nCheck your website — it's live now! 🚀`
      )
    } else {
      await sendMessage(chatId, '⚠️ Saved locally but storage not configured. Set JSONBIN_URL in Vercel env vars.')
    }
    return res.status(200).send('OK')
  }

  // ── Text only message ──
  if (text && !text.startsWith('/')) {
    await sendMessage(chatId,
      `Send a <b>photo with caption</b> to add work to your website.\n\n` +
      `Format: <code>Title | Tag | Result 1 | Result 2</code>\n\n` +
      `Type /help for full instructions.`
    )
  }

  res.status(200).send('OK')
}
