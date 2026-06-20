// api/bot.js - Karios Agency Telegram Bot
// Handles portfolio works AND testimonials

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'GET') return res.status(200).send('OK')

  const BOT_TOKEN = process.env.BOT_TOKEN || ''
  const ADMIN_ID  = process.env.ADMIN_ID  || ''
  const BIN_URL   = process.env.JSONBIN_URL || ''
  const BIN_KEY   = process.env.JSONBIN_KEY || ''
  const CLOUD_NAME   = process.env.CLOUDINARY_NAME   || 'dorw8vhwq'
  const CLOUD_KEY    = process.env.CLOUDINARY_KEY    || '499294615748537'
  const CLOUD_SECRET = process.env.CLOUDINARY_SECRET || 'z17JJ6bKde2TJqGd0fIdokftHi8'

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { return res.status(200).send('OK') }
  }
  if (!body) return res.status(200).send('OK')

  const msg      = body.message
  const callback = body.callback_query

  async function send(chatId, text, keyboard) {
    const payload = { chat_id: chatId, text, parse_mode: 'HTML' }
    if (keyboard) payload.reply_markup = { inline_keyboard: keyboard }
    try {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
    } catch(e) {}
  }

  async function getData() {
    if (!BIN_URL) return { works: [], testimonials: [] }
    try {
      const r = await fetch(BIN_URL + '/latest', { headers: { 'X-Master-Key': BIN_KEY } })
      const d = await r.json()
      return {
        works:        Array.isArray(d.record?.works)        ? d.record.works        : [],
        testimonials: Array.isArray(d.record?.testimonials) ? d.record.testimonials : [],
      }
    } catch { return { works: [], testimonials: [] } }
  }

  async function saveData(data) {
    if (!BIN_URL) return false
    try {
      await fetch(BIN_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Master-Key': BIN_KEY },
        body: JSON.stringify(data)
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
      const crypto    = require('crypto')
      const timestamp = Math.floor(Date.now()/1000)
      const sigStr    = `timestamp=${timestamp}${CLOUD_SECRET}`
      const signature = crypto.createHash('sha1').update(sigStr).digest('hex')
      const form      = new URLSearchParams()
      form.append('file', telegramUrl)
      form.append('api_key', CLOUD_KEY)
      form.append('timestamp', timestamp)
      form.append('signature', signature)
      const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString()
      })
      const d = await r.json()
      return d.secure_url || ''
    } catch { return '' }
  }

  // ── Callback buttons ──
  if (callback) {
    const chatId = callback.message.chat.id
    const data   = callback.data || ''
    const db     = await getData()

    if (data.startsWith('delwork_')) {
      const idx = parseInt(data.replace('delwork_', ''))
      if (!isNaN(idx) && idx >= 0 && idx < db.works.length) {
        const removed = db.works.splice(idx, 1)[0]
        await saveData(db)
        await send(chatId, `✅ Removed work: <b>${removed.title}</b>`)
      }
    } else if (data.startsWith('deltesti_')) {
      const idx = parseInt(data.replace('deltesti_', ''))
      if (!isNaN(idx) && idx >= 0 && idx < db.testimonials.length) {
        const removed = db.testimonials.splice(idx, 1)[0]
        await saveData(db)
        await send(chatId, `✅ Removed testimonial from: <b>${removed.name}</b>`)
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
  // Strict admin check — hardcoded fallback so env var failure never opens access
  const OWNER_ID = ADMIN_ID || '6427084234'
  const isAdmin  = userId === OWNER_ID

  // ── Block non-admins early ──
  // Allow /start for everyone so they can see the menu
  // Block everything else immediately
  if (!text.startsWith('/start') && !isAdmin) {
    await send(chatId,
      `⛔ This bot is private.

` +
      `Only the bot owner can manage the website.
` +
      `Contact us at t.me/kariosagency`
    )
    return res.status(200).send('OK')
  }

  // ── /start ──
  if (text.startsWith('/start')) {
    await send(chatId,
      `👋 <b>Karios Agency Bot</b>\n\n` +
      `Manage your website from Telegram.\n\n` +
      `<b>📁 Portfolio:</b>\n` +
      `/addwork — How to add work\n` +
      `/listworks — See all works\n` +
      `/deletework — Remove a work\n\n` +
      `<b>⭐ Testimonials:</b>\n` +
      `/addtestimonial — How to add testimonial\n` +
      `/listtestimonials — See all testimonials\n` +
      `/deletetestimonial — Remove a testimonial\n\n` +
      `<b>Quick add work:</b>\n` +
      `Send photo + caption:\n` +
      `<code>Title | Tag | Result 1 | Result 2</code>\n\n` +
      `<b>Quick add testimonial:</b>\n` +
      `Send photo (screenshot) + caption:\n` +
      `<code>testimonial: Name | Business | "Quote here"</code>`
    )
    return res.status(200).send('OK')
  }

  // ── /setlogo ──
  if (text === '/setlogo') {
    await send(chatId,
      `<b>How to update your site logo:</b>

` +
      `Send a photo of your logo with caption:
` +
      `<code>logo</code>

` +
      `The image will be saved and used as your site favicon and logo.
` +
      `Best size: square image, at least 200x200px.`
    )
    return res.status(200).send('OK')
  }

  // ── /addwork ──
  if (text === '/addwork') {
    await send(chatId,
      `<b>How to add portfolio work:</b>\n\n` +
      `Send a photo with this caption:\n` +
      `<code>Title | Tag | Result 1 | Result 2</code>\n\n` +
      `<b>Example:</b>\n` +
      `<code>Beauty Brand SA | Product Research | 3/3 sold | $20/wk</code>`
    )
    return res.status(200).send('OK')
  }

  // ── /addtestimonial ──
  if (text === '/addtestimonial') {
    await send(chatId,
      `<b>How to add a testimonial:</b>\n\n` +
      `<b>Option 1 — Text quote:</b>\n` +
      `Send a photo (their profile pic or screenshot) with caption:\n` +
      `<code>testimonial: Name | Business | "Their exact words here"</code>\n\n` +
      `<b>Option 2 — Screenshot only:</b>\n` +
      `Send a screenshot of their WhatsApp/DM with caption:\n` +
      `<code>testimonial: Name | Business</code>\n\n` +
      `<b>Example:</b>\n` +
      `<code>testimonial: John Doe | Fashion Store Lagos | "Karios fixed my SEO and I made 5 sales in the first week!"</code>`
    )
    return res.status(200).send('OK')
  }

  // ── /listworks ──
  if (text === '/listworks') {
    const db = await getData()
    if (!db.works.length) { await send(chatId, 'No works yet.'); return res.status(200).send('OK') }
    let list = `<b>Portfolio (${db.works.length}):</b>\n\n`
    db.works.forEach((w,i) => { list += `${i+1}. <b>${w.title}</b> — ${w.tag}\n` })
    await send(chatId, list)
    return res.status(200).send('OK')
  }

  // ── /listtestimonials ──
  if (text === '/listtestimonials') {
    const db = await getData()
    if (!db.testimonials.length) { await send(chatId, 'No testimonials yet.'); return res.status(200).send('OK') }
    let list = `<b>Testimonials (${db.testimonials.length}):</b>\n\n`
    db.testimonials.forEach((t,i) => { list += `${i+1}. <b>${t.name}</b> — ${t.business}\n` })
    await send(chatId, list)
    return res.status(200).send('OK')
  }

  // ── /deletework ──
  if (text === '/deletework') {
    if (!isAdmin) { await send(chatId, '❌ Not authorised.'); return res.status(200).send('OK') }
    const db = await getData()
    if (!db.works.length) { await send(chatId, 'Nothing to delete.'); return res.status(200).send('OK') }
    const keyboard = db.works.map((w,i) => [{ text: `🗑 ${w.title}`, callback_data: `delwork_${i}` }])
    await send(chatId, 'Which work to remove?', keyboard)
    return res.status(200).send('OK')
  }

  // ── /deletetestimonial ──
  if (text === '/deletetestimonial') {
    if (!isAdmin) { await send(chatId, '❌ Not authorised.'); return res.status(200).send('OK') }
    const db = await getData()
    if (!db.testimonials.length) { await send(chatId, 'Nothing to delete.'); return res.status(200).send('OK') }
    const keyboard = db.testimonials.map((t,i) => [{ text: `🗑 ${t.name} — ${t.business}`, callback_data: `deltesti_${i}` }])
    await send(chatId, 'Which testimonial to remove?', keyboard)
    return res.status(200).send('OK')
  }

  // ── Photo + caption ──
  if (photo && caption) {
    if (!isAdmin) { await send(chatId, '❌ Not authorised.'); return res.status(200).send('OK') }

    const isTestimonial = caption.toLowerCase().startsWith('testimonial:')
    const isLogo        = caption.toLowerCase().trim() === 'logo'
    const db = await getData()

    // ── Logo upload ──
    if (isLogo) {
      await send(chatId, '⏳ Uploading logo...')
      const fileId      = photo[photo.length-1].file_id
      const telegramUrl = await getPhotoUrl(fileId)
      const imgUrl      = await uploadToCloudinary(telegramUrl)
      if (imgUrl) {
        db.logo = imgUrl
        await saveData(db)
        await send(chatId,
          `✅ <b>Logo updated!</b>

` +
          `Your logo is now stored. To use it as favicon on your website, copy this URL:
` +
          `<code>${imgUrl}</code>

` +
          `Add it to your index.html as:
` +
          `<code>&lt;link rel="icon" href="${imgUrl}"&gt;</code>`
        )
      } else {
        await send(chatId, '⚠️ Upload failed. Try again.')
      }
      return res.status(200).send('OK')
    }

    await send(chatId, '⏳ Uploading image...')
    const fileId      = photo[photo.length-1].file_id
    const telegramUrl = await getPhotoUrl(fileId)
    const imgUrl      = await uploadToCloudinary(telegramUrl) || telegramUrl

    if (isTestimonial) {
      // Parse testimonial caption: "testimonial: Name | Business | Quote"
      const clean = caption.replace(/^testimonial:\s*/i, '')
      const parts = clean.split('|').map(s => s.trim())
      const name     = parts[0] || 'Client'
      const business = parts[1] || ''
      const quote    = (parts[2] || '').replace(/^["']|["']$/g, '').trim()

      db.testimonials.unshift({
        id: Date.now(), name, business, quote, imgUrl,
        addedAt: new Date().toISOString()
      })
      const saved = await saveData(db)
      await send(chatId,
        saved
          ? `✅ <b>Testimonial added!</b>\n\n⭐ <b>${name}</b> — ${business}\n${quote ? `"${quote}"` : '(screenshot)'}\n\nLive on your website! 🚀`
          : `⚠️ Could not save. Check your env vars.`
      )
    } else {
      // Portfolio work
      const parts   = caption.split('|').map(s => s.trim())
      const title   = parts[0] || 'New Work'
      const tag     = parts[1] || 'Project'
      const result1 = parts[2] || ''
      const result2 = parts[3] || ''

      db.works.unshift({
        id: Date.now(), title, tag, result1, result2, imgUrl,
        addedAt: new Date().toISOString()
      })
      const saved = await saveData(db)
      await send(chatId,
        saved
          ? `✅ <b>Work added!</b>\n\n📌 <b>${title}</b>\n🏷 ${tag}\n${result1?`📊 ${result1}\n`:''}${result2?`📊 ${result2}\n`:''}\nLive on your website! 🚀`
          : `⚠️ Could not save. Check your env vars.`
      )
    }
    return res.status(200).send('OK')
  }

  // Unknown
  if (text && !text.startsWith('/')) {
    await send(chatId,
      `Send a <b>photo with caption</b> to add content.\n\n` +
      `Portfolio: <code>Title | Tag | Result 1 | Result 2</code>\n` +
      `Testimonial: <code>testimonial: Name | Business | "Quote"</code>\n\n` +
      `Type /start for full menu.`
    )
  }

  res.status(200).send('OK')
}
