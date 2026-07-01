// api/bot.js - Multi-Site Telegram Bot
// Manages multiple websites — Karios Agency and Mama's Kitchen
// Each site has its own JSONbin storage

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'GET') return res.status(200).send('OK')

  const BOT_TOKEN = process.env.BOT_TOKEN || ''
  const ADMIN_ID  = process.env.ADMIN_ID  || ''
  const CLOUD_NAME   = process.env.CLOUDINARY_NAME   || 'dorw8vhwq'
  const CLOUD_KEY    = process.env.CLOUDINARY_KEY    || '499294615748537'
  const CLOUD_SECRET = process.env.CLOUDINARY_SECRET || 'z17JJ6bKde2TJqGd0fIdokftHi8'
  const BIN_KEY = process.env.JSONBIN_KEY || ''

  // ── SITE REGISTRY — add new sites here ──
  const SITES = {
    karios: {
      name: 'Karios Agency',
      emoji: '⚡',
      binUrl: 'https://api.jsonbin.io/v3/b/' + (process.env.JSONBIN_BIN_KARIOS || '6a2b9c8ff5f4af5e29e4612d'),
      itemLabel: 'work',
      itemFormat: 'Title | Tag | Result 1 | Result 2',
      itemExample: 'Fashion Store Lagos | SEO Fix | 0→12 sales | +340% traffic',
    },
    mamaskitchen: {
      name: "Mama's Kitchen",
      emoji: '🍽️',
      binUrl: 'https://api.jsonbin.io/v3/b/' + (process.env.JSONBIN_BIN_MAMAS || '6a4412b7da38895dfe17b1f7'),
      itemLabel: 'dish',
      itemFormat: 'Dish | Tag | Price | Description',
      itemExample: 'Jollof Rice Special | Bestseller | $12 | Smoky party-style rice with grilled chicken',
    },
  }

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

  async function getData(binUrl) {
    try {
      const r = await fetch(binUrl + '/latest', { headers: { 'X-Master-Key': BIN_KEY } })
      const d = await r.json()
      return {
        works:        Array.isArray(d.record?.works)        ? d.record.works        : [],
        testimonials: Array.isArray(d.record?.testimonials) ? d.record.testimonials : [],
        logo:         d.record?.logo || '',
      }
    } catch { return { works: [], testimonials: [], logo: '' } }
  }

  async function saveData(binUrl, data) {
    try {
      await fetch(binUrl, {
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

  function siteMenu() {
    return Object.entries(SITES).map(([key, s]) => ([{
      text: `${s.emoji} ${s.name}`,
      callback_data: `site_${key}`
    }]))
  }

  // Session stored in a simple JSON file approach
  // Since Vercel is stateless we use a separate session bin
  const SESSION_BIN = 'https://api.jsonbin.io/v3/b/' + (process.env.JSONBIN_BIN_SESSION || '6a2b9c8ff5f4af5e29e4612d')

  async function getSession() {
    try {
      const r = await fetch(SESSION_BIN + '/latest', { headers: { 'X-Master-Key': BIN_KEY } })
      const d = await r.json()
      return d.record?.sessions || {}
    } catch { return {} }
  }

  async function saveSession(sessions) {
    try {
      await fetch(SESSION_BIN, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Master-Key': BIN_KEY },
        body: JSON.stringify({ sessions })
      })
    } catch {}
  }

  // ── Callback buttons ──
  if (callback) {
    const chatId = callback.message.chat.id
    const data   = callback.data || ''
    const userId = String(callback.from?.id || '')
    const isAdmin = userId === (ADMIN_ID || '6427084234')

    if (!isAdmin) {
      await send(chatId, '⛔ Not authorised.')
      return res.status(200).send('OK')
    }

    // Site selection
    if (data.startsWith('site_')) {
      const siteKey = data.replace('site_', '')
      const sessions = await getSession()
      sessions[chatId] = siteKey
      await saveSession(sessions)
      const site = SITES[siteKey]
      await send(chatId,
        `✅ Now managing: <b>${site.emoji} ${site.name}</b>\n\n` +
        `Send a photo with caption:\n` +
        `<code>${site.itemFormat}</code>\n\n` +
        `<b>Example:</b>\n<code>${site.itemExample}</code>\n\n` +
        `Or use:\n/listworks · /deletework · /addtestimonial · /switchsite`
      )
      return res.status(200).send('OK')
    }

    // Delete handlers
    const sessions0 = await getSession()
    const siteKey = sessions0[chatId]
    if (!siteKey) {
      await send(chatId, 'Please select a site first with /start')
      return res.status(200).send('OK')
    }
    const site = SITES[siteKey]
    const db   = await getData(site.binUrl)

    if (data.startsWith('delwork_')) {
      const idx = parseInt(data.replace('delwork_', ''))
      if (!isNaN(idx) && idx >= 0 && idx < db.works.length) {
        const removed = db.works.splice(idx, 1)[0]
        await saveData(site.binUrl, db)
        await send(chatId, `✅ Removed: <b>${removed.title}</b>`)
      }
    } else if (data.startsWith('deltesti_')) {
      const idx = parseInt(data.replace('deltesti_', ''))
      if (!isNaN(idx) && idx >= 0 && idx < db.testimonials.length) {
        const removed = db.testimonials.splice(idx, 1)[0]
        await saveData(site.binUrl, db)
        await send(chatId, `✅ Removed review from: <b>${removed.name}</b>`)
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
  const OWNER_ID = ADMIN_ID || '6427084234'
  const isAdmin  = userId === OWNER_ID

  // Block non-admins
  if (!text.startsWith('/start') && !isAdmin) {
    await send(chatId, `⛔ This bot is private.\n\nContact us at t.me/kariosagency`)
    return res.status(200).send('OK')
  }

  // ── /start — show site picker ──
  if (text.startsWith('/start')) {
    await send(chatId,
      `👋 <b>Multi-Site Manager</b>\n\nWhich website do you want to work on?`,
      siteMenu()
    )
    return res.status(200).send('OK')
  }

  // ── /switchsite ──
  if (text === '/switchsite') {
    await send(chatId, `Switch to which site?`, siteMenu())
    return res.status(200).send('OK')
  }

  // From here, need an active site selected
  const sessions1 = await getSession()
  const siteKey = sessions1[chatId]
  if (!siteKey) {
    await send(chatId, `Please pick a site first:`, siteMenu())
    return res.status(200).send('OK')
  }
  const site = SITES[siteKey]

  // ── /addwork ──
  if (text === '/addwork') {
    await send(chatId,
      `<b>How to add a ${site.itemLabel} to ${site.name}:</b>\n\n` +
      `Send a photo with caption:\n<code>${site.itemFormat}</code>\n\n` +
      `<b>Example:</b>\n<code>${site.itemExample}</code>`
    )
    return res.status(200).send('OK')
  }

  // ── /addtestimonial ──
  if (text === '/addtestimonial') {
    await send(chatId,
      `<b>How to add a review/testimonial:</b>\n\n` +
      `Send a photo with caption:\n` +
      `<code>testimonial: Name | Business | "Quote here"</code>\n\n` +
      `<b>Example:</b>\n` +
      `<code>testimonial: John Doe | ${site.name} | "Amazing experience!"</code>`
    )
    return res.status(200).send('OK')
  }

  // ── /setlogo ──
  if (text === '/setlogo') {
    await send(chatId,
      `<b>Update logo for ${site.name}:</b>\n\nSend a photo with caption:\n<code>logo</code>`
    )
    return res.status(200).send('OK')
  }

  // ── /listworks ──
  if (text === '/listworks') {
    const db = await getData(site.binUrl)
    if (!db.works.length) { await send(chatId, `No ${site.itemLabel}s yet on ${site.name}.`); return res.status(200).send('OK') }
    let list = `<b>${site.name} — ${db.works.length} item(s):</b>\n\n`
    db.works.forEach((w,i) => { list += `${i+1}. <b>${w.title}</b> — ${w.tag}\n` })
    await send(chatId, list)
    return res.status(200).send('OK')
  }

  // ── /listtestimonials ──
  if (text === '/listtestimonials') {
    const db = await getData(site.binUrl)
    if (!db.testimonials.length) { await send(chatId, 'No reviews yet.'); return res.status(200).send('OK') }
    let list = `<b>Reviews (${db.testimonials.length}):</b>\n\n`
    db.testimonials.forEach((t,i) => { list += `${i+1}. <b>${t.name}</b> — ${t.business}\n` })
    await send(chatId, list)
    return res.status(200).send('OK')
  }

  // ── /deletework ──
  if (text === '/deletework') {
    const db = await getData(site.binUrl)
    if (!db.works.length) { await send(chatId, 'Nothing to delete.'); return res.status(200).send('OK') }
    const keyboard = db.works.map((w,i) => [{ text: `🗑 ${w.title}`, callback_data: `delwork_${i}` }])
    await send(chatId, 'Which item to remove?', keyboard)
    return res.status(200).send('OK')
  }

  // ── /deletetestimonial ──
  if (text === '/deletetestimonial') {
    const db = await getData(site.binUrl)
    if (!db.testimonials.length) { await send(chatId, 'Nothing to delete.'); return res.status(200).send('OK') }
    const keyboard = db.testimonials.map((t,i) => [{ text: `🗑 ${t.name}`, callback_data: `deltesti_${i}` }])
    await send(chatId, 'Which review to remove?', keyboard)
    return res.status(200).send('OK')
  }

  // ── Photo + caption ──
  if (photo && caption) {
    const isTestimonial = caption.toLowerCase().startsWith('testimonial:')
    const isLogo         = caption.toLowerCase().trim() === 'logo'
    const db = await getData(site.binUrl)

    await send(chatId, '⏳ Uploading...')
    const fileId       = photo[photo.length-1].file_id
    const telegramUrl  = await getPhotoUrl(fileId)
    const imgUrl       = await uploadToCloudinary(telegramUrl) || telegramUrl

    if (isLogo) {
      db.logo = imgUrl
      await saveData(site.binUrl, db)
      await send(chatId, `✅ Logo updated for <b>${site.name}</b>!`)
      return res.status(200).send('OK')
    }

    if (isTestimonial) {
      const clean = caption.replace(/^testimonial:\s*/i, '')
      const parts = clean.split('|').map(s => s.trim())
      const name     = parts[0] || 'Client'
      const business = parts[1] || ''
      const quote    = (parts[2] || '').replace(/^["']|["']$/g, '').trim()
      db.testimonials.unshift({ id: Date.now(), name, business, quote, imgUrl, addedAt: new Date().toISOString() })
      const saved = await saveData(site.binUrl, db)
      await send(chatId,
        saved
          ? `✅ <b>Review added to ${site.name}!</b>\n\n⭐ <b>${name}</b> — ${business}\n${quote ? `"${quote}"` : '(photo only)'}`
          : `⚠️ Could not save.`
      )
    } else {
      const parts   = caption.split('|').map(s => s.trim())
      const title   = parts[0] || 'New Item'
      const tag     = parts[1] || ''
      const result1 = parts[2] || ''
      const result2 = parts[3] || ''
      db.works.unshift({ id: Date.now(), title, tag, result1, result2, imgUrl, addedAt: new Date().toISOString() })
      const saved = await saveData(site.binUrl, db)
      await send(chatId,
        saved
          ? `✅ <b>Added to ${site.name}!</b>\n\n📌 <b>${title}</b>\n${tag?`🏷 ${tag}\n`:''}${result1?`💰 ${result1}\n`:''}${result2?`📝 ${result2}\n`:''}`
          : `⚠️ Could not save.`
      )
    }
    return res.status(200).send('OK')
  }

  // Unknown
  if (text && !text.startsWith('/')) {
    await send(chatId,
      `Currently managing: <b>${site.emoji} ${site.name}</b>\n\n` +
      `Send a photo + caption to add content.\n` +
      `Type /switchsite to change site.`
    )
  }

  res.status(200).send('OK')
}
