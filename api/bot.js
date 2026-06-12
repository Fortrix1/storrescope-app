// api/bot.js - Telegram bot webhook

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  
  // Must return 200 immediately or Telegram retries
  if (req.method === 'GET') return res.status(200).send('OK')

  const BOT_TOKEN = process.env.BOT_TOKEN || ''
  const ADMIN_ID  = process.env.ADMIN_ID  || ''
  const BIN_URL   = process.env.JSONBIN_URL || ''
  const BIN_KEY   = process.env.JSONBIN_KEY || ''

  // Parse body
  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { return res.status(200).send('OK') }
  }
  if (!body) return res.status(200).send('OK')

  const msg      = body.message
  const callback = body.callback_query

  async function send(chatId, text, keyboard) {
    const payload = {
      chat_id:    chatId,
      text,
      parse_mode: 'HTML'
    }
    if (keyboard) payload.reply_markup = { inline_keyboard: keyboard }
    try {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload)
      })
    } catch(e) {}
  }

  async function getWorks() {
    if (!BIN_URL) return []
    try {
      const r = await fetch(BIN_URL + '/latest', {
        headers: { 'X-Master-Key': BIN_KEY }
      })
      const d = await r.json()
      return Array.isArray(d.record?.works) ? d.record.works : []
    } catch { return [] }
  }

  async function saveWorks(works) {
    if (!BIN_URL) return false
    try {
      await fetch(BIN_URL, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Master-Key': BIN_KEY },
        body:    JSON.stringify({ works })
      })
      return true
    } catch { return false }
  }

  async function getPhotoUrl(fileId) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`)
      const d = await r.json()
      return `https://api.telegram.org/file/bot${BOT_TOKEN}/${d.result.file_path}`
    } catch { return '' }
  }

  async function uploadToCloudinary(telegramUrl) {
    try {
      const CLOUD_NAME   = process.env.CLOUDINARY_NAME   || 'dorw8vhwq'
      const CLOUD_KEY    = process.env.CLOUDINARY_KEY    || '499294615748537'
      const CLOUD_SECRET = process.env.CLOUDINARY_SECRET || 'z17JJ6bKde2TJqGd0fIdokftHi8'

      // Generate signature
      const timestamp = Math.floor(Date.now()/1000)
      const crypto    = require('crypto')
      const sigStr    = `timestamp=${timestamp}${CLOUD_SECRET}`
      const signature = crypto.createHash('sha1').update(sigStr).digest('hex')

      const form = new URLSearchParams()
      form.append('file',      telegramUrl)
      form.append('api_key',   CLOUD_KEY)
      form.append('timestamp', timestamp)
      form.append('signature', signature)

      const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    form.toString()
      })
      const d = await r.json()
      return d.secure_url || ''
    } catch(e) {
      return ''
    }
  }

  // ── Handle callback (delete buttons) ──
  if (callback) {
    const chatId = callback.message.chat.id
    const data   = callback.data || ''
    if (data.startsWith('delete_')) {
      const idx   = parseInt(data.replace('delete_', ''))
      const works = await getWorks()
      if (!isNaN(idx) && idx >= 0 && idx < works.length) {
        const removed = works.splice(idx, 1)[0]
        await saveWorks(works)
        await send(chatId, `✅ Removed: <b>${removed.title}</b>\nWebsite updated!`)
      }
    }
    return res.status(200).send('OK')
  }

  if (!msg) return res.status(200).send('OK')

  const chatId  = msg.chat.id
  const userId  = String(msg.from?.id || '')
  const text    = msg.text || ''
  const caption = msg.caption || ''
  const photo   = msg.photo
  const isAdmin = !ADMIN_ID || userId === ADMIN_ID

  // ── /start ──
  if (text === '/start' || text.startsWith('/start')) {
    await send(chatId,
      `👋 <b>Karios Agency Bot</b>\n\n` +
      `Update your website portfolio instantly.\n\n` +
      `<b>Commands:</b>\n` +
      `/addwork — How to add work\n` +
      `/listworks — See all portfolio items\n` +
      `/deletework — Remove an item\n\n` +
      `<b>Quick add:</b>\n` +
      `Send a photo with this caption:\n` +
      `<code>Title | Tag | Result 1 | Result 2</code>\n\n` +
      `Example:\n` +
      `<code>Fashion Store Lagos | SEO Fix | 0→12 sales | +340% traffic</code>`
    )
    return res.status(200).send('OK')
  }

  // ── /addwork ──
  if (text === '/addwork') {
    await send(chatId,
      `<b>How to add work:</b>\n\n` +
      `1. Take a screenshot or photo of the work\n` +
      `2. Send it here with this caption:\n\n` +
      `<code>Store Name | Service | Result 1 | Result 2</code>\n\n` +
      `<b>Example:</b>\n` +
      `<code>Beauty Brand SA | Product Research | 3/3 sold | $20/wk</code>\n\n` +
      `It will appear on your website instantly! 🚀`
    )
    return res.status(200).send('OK')
  }

  // ── /listworks ──
  if (text === '/listworks') {
    const works = await getWorks()
    if (!works.length) {
      await send(chatId, 'No works yet. Send a photo with caption to add one!')
      return res.status(200).send('OK')
    }
    let list = `<b>Your portfolio (${works.length} items):</b>\n\n`
    works.forEach((w, i) => { list += `${i+1}. <b>${w.title}</b> — ${w.tag}\n` })
    await send(chatId, list)
    return res.status(200).send('OK')
  }

  // ── /deletework ──
  if (text === '/deletework') {
    if (!isAdmin) { await send(chatId, '❌ Not authorised.'); return res.status(200).send('OK') }
    const works = await getWorks()
    if (!works.length) { await send(chatId, 'Nothing to delete.'); return res.status(200).send('OK') }
    const keyboard = works.map((w, i) => [{ text: `🗑 ${w.title}`, callback_data: `delete_${i}` }])
    await send(chatId, 'Which work to remove?', keyboard)
    return res.status(200).send('OK')
  }

  // ── Photo + caption = add work ──
  if (photo && caption) {
    if (!isAdmin) { await send(chatId, '❌ Not authorised.'); return res.status(200).send('OK') }
    const parts   = caption.split('|').map(s => s.trim())
    const title   = parts[0] || 'New Work'
    const tag     = parts[1] || 'Project'
    const result1 = parts[2] || ''
    const result2 = parts[3] || ''
    const fileId     = photo[photo.length-1].file_id
    const telegramUrl = await getPhotoUrl(fileId)
    // Upload to Cloudinary for permanent storage
    await send(chatId, '⏳ Uploading image...')
    const imgUrl = await uploadToCloudinary(telegramUrl) || telegramUrl
    const works   = await getWorks()
    works.unshift({ id: Date.now(), title, tag, result1, result2, imgUrl, addedAt: new Date().toISOString() })
    const saved   = await saveWorks(works)
    await send(chatId,
      saved
        ? `✅ <b>Added to your website!</b>\n\n📌 <b>${title}</b>\n🏷 ${tag}\n${result1?`📊 ${result1}\n`:''}${result2?`📊 ${result2}\n`:''}\nCheck your about page — it's live! 🚀`
        : `⚠️ Could not save. Check your JSONBIN_URL and JSONBIN_KEY in Vercel env vars.`
    )
    return res.status(200).send('OK')
  }

  // ── Unknown message ──
  if (text && !text.startsWith('/')) {
    await send(chatId, `Send a <b>photo with caption</b> to add work.\n\nFormat: <code>Title | Tag | Result 1 | Result 2</code>\n\nType /help for instructions.`)
  }

  res.status(200).send('OK')
}
