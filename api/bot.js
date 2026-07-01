// api/bot.js - Multi-Site Bot (stateless — site encoded in every message)

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'GET') return res.status(200).send('OK')

  const BOT_TOKEN    = process.env.BOT_TOKEN    || ''
  const ADMIN_ID     = process.env.ADMIN_ID     || '6427084234'
  const BIN_KEY      = process.env.JSONBIN_KEY  || ''
  const CLOUD_NAME   = process.env.CLOUDINARY_NAME   || 'dorw8vhwq'
  const CLOUD_KEY    = process.env.CLOUDINARY_KEY    || '499294615748537'
  const CLOUD_SECRET = process.env.CLOUDINARY_SECRET || 'z17JJ6bKde2TJqGd0fIdokftHi8'

  const SITES = {
    karios: {
      name: 'Karios Agency', emoji: '⚡',
      binUrl: 'https://api.jsonbin.io/v3/b/6a2b9c8ff5f4af5e29e4612d',
      itemFormat: 'Title | Tag | Result 1 | Result 2',
      itemExample: 'Fashion Store Lagos | SEO Fix | 0→12 sales | +340% traffic',
    },
    mamas: {
      name: "Mama's Kitchen", emoji: '🍽️',
      binUrl: 'https://api.jsonbin.io/v3/b/6a4412b7da38895dfe17b1f7',
      itemFormat: 'Dish | Tag | Price | Description',
      itemExample: 'Jollof Rice | Bestseller | $12 | Smoky party rice with grilled chicken',
    },
  }

  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { return res.status(200).send('OK') } }
  if (!body) return res.status(200).send('OK')

  const msg      = body.message
  const callback = body.callback_query

  async function send(chatId, text, keyboard) {
    const payload = { chat_id: chatId, text, parse_mode: 'HTML' }
    if (keyboard) payload.reply_markup = { inline_keyboard: keyboard }
    try {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
    } catch(e) {}
  }

  async function getData(binUrl) {
    try {
      const r = await fetch(binUrl + '/latest', { headers: { 'X-Master-Key': BIN_KEY } })
      const d = await r.json()
      return { works: d.record?.works || [], testimonials: d.record?.testimonials || [], logo: d.record?.logo || '' }
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

  async function uploadToCloudinary(url) {
    try {
      const crypto    = require('crypto')
      const timestamp = Math.floor(Date.now()/1000)
      const signature = crypto.createHash('sha1').update(`timestamp=${timestamp}${CLOUD_SECRET}`).digest('hex')
      const form      = new URLSearchParams()
      form.append('file', url); form.append('api_key', CLOUD_KEY)
      form.append('timestamp', timestamp); form.append('signature', signature)
      const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString()
      })
      const d = await r.json()
      return d.secure_url || ''
    } catch { return '' }
  }

  function siteKeyboard() {
    return [
      [{ text: '⚡ Karios Agency',  callback_data: 'goto_karios' }],
      [{ text: "🍽️ Mama's Kitchen", callback_data: 'goto_mamas'  }],
    ]
  }

  function siteMenu(siteKey) {
    const site = SITES[siteKey]
    return [
      [{ text: '➕ Add item',         callback_data: `help_add_${siteKey}`   }],
      [{ text: '⭐ Add review',        callback_data: `help_testi_${siteKey}` }],
      [{ text: '🖼 Set logo',          callback_data: `help_logo_${siteKey}`  }],
      [{ text: '📋 List items',        callback_data: `list_${siteKey}`       }],
      [{ text: '🗑 Delete item',       callback_data: `dellist_${siteKey}`    }],
      [{ text: '🗑 Delete review',     callback_data: `deltestilist_${siteKey}`}],
      [{ text: '🔀 Switch site',       callback_data: 'switch_site'           }],
    ]
  }

  // ── CALLBACKS ──
  if (callback) {
    const chatId  = callback.message.chat.id
    const userId  = String(callback.from?.id || '')
    const data    = callback.data || ''
    const isAdmin = userId === ADMIN_ID

    if (!isAdmin) { await send(chatId, '⛔ Not authorised.'); return res.status(200).send('OK') }

    // Site picker
    if (data === 'goto_karios' || data === 'goto_mamas') {
      const siteKey = data.replace('goto_', '')
      const site    = SITES[siteKey]
      await send(chatId,
        `${site.emoji} <b>Now managing: ${site.name}</b>\n\nWhat would you like to do?`,
        siteMenu(siteKey)
      )
      return res.status(200).send('OK')
    }

    if (data === 'switch_site') {
      await send(chatId, 'Which site?', siteKeyboard())
      return res.status(200).send('OK')
    }

    // Help messages — tell user what caption to send
    if (data.startsWith('help_add_')) {
      const siteKey = data.replace('help_add_', '')
      const site    = SITES[siteKey]
      await send(chatId,
        `<b>Add item to ${site.name}:</b>\n\n` +
        `Send a photo with caption:\n<code>${site.itemFormat}</code>\n\n` +
        `Start caption with <b>${siteKey}:</b>\n\n` +
        `<b>Example:</b>\n<code>${siteKey}: ${site.itemExample}</code>`
      )
      return res.status(200).send('OK')
    }

    if (data.startsWith('help_testi_')) {
      const siteKey = data.replace('help_testi_', '')
      await send(chatId,
        `<b>Add review:</b>\n\nSend a photo with caption starting with:\n` +
        `<code>${siteKey} testimonial: Name | Business | "Quote"</code>\n\n` +
        `<b>Example:</b>\n<code>${siteKey} testimonial: John | Lagos Bistro | "Amazing food!"</code>`
      )
      return res.status(200).send('OK')
    }

    if (data.startsWith('help_logo_')) {
      const siteKey = data.replace('help_logo_', '')
      await send(chatId,
        `<b>Set logo:</b>\n\nSend a photo with caption:\n<code>${siteKey} logo</code>`
      )
      return res.status(200).send('OK')
    }

    // List items
    if (data.startsWith('list_')) {
      const siteKey = data.replace('list_', '')
      const site    = SITES[siteKey]
      const db      = await getData(site.binUrl)
      if (!db.works.length) { await send(chatId, `No items yet on ${site.name}.`); return res.status(200).send('OK') }
      let list = `<b>${site.name} items (${db.works.length}):</b>\n\n`
      db.works.forEach((w,i) => { list += `${i+1}. <b>${w.title}</b> — ${w.tag}\n` })
      await send(chatId, list)
      return res.status(200).send('OK')
    }

    // Delete item list
    if (data.startsWith('dellist_')) {
      const siteKey = data.replace('dellist_', '')
      const site    = SITES[siteKey]
      const db      = await getData(site.binUrl)
      if (!db.works.length) { await send(chatId, 'Nothing to delete.'); return res.status(200).send('OK') }
      const keyboard = db.works.map((w,i) => [{ text: `🗑 ${w.title}`, callback_data: `delwork_${siteKey}_${i}` }])
      keyboard.push([{ text: '← Back', callback_data: `goto_${siteKey}` }])
      await send(chatId, 'Which item to remove?', keyboard)
      return res.status(200).send('OK')
    }

    // Delete testimonial list
    if (data.startsWith('deltestilist_')) {
      const siteKey = data.replace('deltestilist_', '')
      const site    = SITES[siteKey]
      const db      = await getData(site.binUrl)
      if (!db.testimonials.length) { await send(chatId, 'Nothing to delete.'); return res.status(200).send('OK') }
      const keyboard = db.testimonials.map((t,i) => [{ text: `🗑 ${t.name}`, callback_data: `deltesti_${siteKey}_${i}` }])
      keyboard.push([{ text: '← Back', callback_data: `goto_${siteKey}` }])
      await send(chatId, 'Which review to remove?', keyboard)
      return res.status(200).send('OK')
    }

    // Confirm delete item
    if (data.startsWith('delwork_')) {
      const parts   = data.split('_')
      const siteKey = parts[1]
      const idx     = parseInt(parts[2])
      const site    = SITES[siteKey]
      const db      = await getData(site.binUrl)
      if (!isNaN(idx) && idx >= 0 && idx < db.works.length) {
        const removed = db.works.splice(idx, 1)[0]
        await saveData(site.binUrl, db)
        await send(chatId, `✅ Removed: <b>${removed.title}</b> from ${site.name}`)
      }
      return res.status(200).send('OK')
    }

    // Confirm delete testimonial
    if (data.startsWith('deltesti_')) {
      const parts   = data.split('_')
      const siteKey = parts[1]
      const idx     = parseInt(parts[2])
      const site    = SITES[siteKey]
      const db      = await getData(site.binUrl)
      if (!isNaN(idx) && idx >= 0 && idx < db.testimonials.length) {
        const removed = db.testimonials.splice(idx, 1)[0]
        await saveData(site.binUrl, db)
        await send(chatId, `✅ Removed review from: <b>${removed.name}</b>`)
      }
      return res.status(200).send('OK')
    }

    return res.status(200).send('OK')
  }

  if (!msg) return res.status(200).send('OK')

  const chatId  = msg.chat.id
  const userId  = String(msg.from?.id || '')
  const text    = msg.text    || ''
  const caption = (msg.caption || '').trim()
  const photo   = msg.photo
  const isAdmin = userId === ADMIN_ID

  // Block non-admins
  if (!text.startsWith('/start') && !isAdmin) {
    await send(chatId, `⛔ This bot is private.\n\nContact: t.me/kariosagency`)
    return res.status(200).send('OK')
  }

  // /start
  if (text.startsWith('/start')) {
    await send(chatId, `👋 <b>Multi-Site Manager</b>\n\nWhich website do you want to manage?`, siteKeyboard())
    return res.status(200).send('OK')
  }

  // Photo + caption — site is identified by caption PREFIX
  // Format: "sitekey: caption..." or "sitekey testimonial: ..." or "sitekey logo"
  if (photo && caption) {
    if (!isAdmin) { await send(chatId, '⛔ Not authorised.'); return res.status(200).send('OK') }

    // Detect which site from caption prefix
    let siteKey = null
    let cleanCaption = caption

    for (const key of Object.keys(SITES)) {
      if (caption.toLowerCase().startsWith(key + ':') ||
          caption.toLowerCase().startsWith(key + ' ')) {
        siteKey      = key
        cleanCaption = caption.slice(key.length).replace(/^[\s:]+/, '').trim()
        break
      }
    }

    if (!siteKey) {
      await send(chatId,
        `⚠️ Please start your caption with the site name:\n\n` +
        `<code>karios: Title | Tag | Result1 | Result2</code>\n` +
        `<code>mamas: Dish | Tag | Price | Description</code>\n\n` +
        `Or for logo: <code>karios logo</code> / <code>mamas logo</code>\n` +
        `Or for review: <code>karios testimonial: Name | Biz | "Quote"</code>`
      )
      return res.status(200).send('OK')
    }

    const site = SITES[siteKey]
    const isLogo        = cleanCaption.toLowerCase() === 'logo'
    const isTestimonial = cleanCaption.toLowerCase().startsWith('testimonial:')

    await send(chatId, '⏳ Uploading...')
    const fileId      = photo[photo.length-1].file_id
    const telegramUrl = await getPhotoUrl(fileId)
    const imgUrl      = await uploadToCloudinary(telegramUrl) || telegramUrl
    const db          = await getData(site.binUrl)

    if (isLogo) {
      db.logo = imgUrl
      await saveData(site.binUrl, db)
      await send(chatId, `✅ Logo updated for <b>${site.name}</b>!`)
      return res.status(200).send('OK')
    }

    if (isTestimonial) {
      const clean = cleanCaption.replace(/^testimonial:\s*/i, '')
      const parts = clean.split('|').map(s => s.trim())
      const name  = parts[0] || 'Client'
      const biz   = parts[1] || ''
      const quote = (parts[2] || '').replace(/^["']|["']$/g, '').trim()
      db.testimonials.unshift({ id: Date.now(), name, business: biz, quote, imgUrl, addedAt: new Date().toISOString() })
      const saved = await saveData(site.binUrl, db)
      await send(chatId, saved
        ? `✅ <b>Review added to ${site.name}!</b>\n\n⭐ <b>${name}</b>${biz?` — ${biz}`:''}\n${quote?`"${quote}"`:''}`
        : `⚠️ Could not save.`)
      return res.status(200).send('OK')
    }

    // Regular item
    const parts   = cleanCaption.split('|').map(s => s.trim())
    const title   = parts[0] || 'New Item'
    const tag     = parts[1] || ''
    const result1 = parts[2] || ''
    const result2 = parts[3] || ''
    db.works.unshift({ id: Date.now(), title, tag, result1, result2, imgUrl, addedAt: new Date().toISOString() })
    const saved = await saveData(site.binUrl, db)
    await send(chatId, saved
      ? `✅ <b>Added to ${site.name}!</b>\n\n📌 <b>${title}</b>\n${tag?`🏷 ${tag}\n`:''}${result1?`💰 ${result1}\n`:''}${result2?`📝 ${result2}`:''}`
      : `⚠️ Could not save.`)
    return res.status(200).send('OK')
  }

  // Unknown text
  if (text && !text.startsWith('/')) {
    await send(chatId, `Use /start to pick a site and see options.`)
  }

  res.status(200).send('OK')
}
