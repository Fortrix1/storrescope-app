// api/bot.js - Multi-Site Bot with Voice Note Photo Flow
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'GET') return res.status(200).send('OK')
  
  const BOT_TOKEN    = process.env.BOT_TOKEN    || ''
  const ADMIN_ID     = process.env.ADMIN_ID     || '6427084234'
  const BIN_KEY      = process.env.JSONBIN_KEY  || ''
  const CLOUD_NAME   = process.env.CLOUDINARY_NAME   || 'dorw8vhwq'
  const CLOUD_KEY    = process.env.CLOUDINARY_KEY    || '499294615748537'
  const CLOUD_SECRET = process.env.CLOUDINARY_SECRET || 'z17JJ6bKde2TJqGd0fIdokftHi8'
  const KARIOS_BIN   = 'https://api.jsonbin.io/v3/b/6a2b9c8ff5f4af5e29e4612d'
  
  const SITES = {
    karios: {
      name: 'Karios Agency', emoji: '',
      binUrl: KARIOS_BIN,
      itemFormat: 'Title | Tag | Result 1 | Result 2',
      itemExample: 'Fashion Store Lagos | SEO Fix | 0→12 sales | +340% traffic',
    },
    mamas: {
      name: "Mama's Kitchen", emoji: '🍽️',
      binUrl: 'https://api.jsonbin.io/v3/b/6a482123f5f4af5e295c3098',
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
      const rec = d.record || {}
      return {
        works:        rec.works        || [],
        testimonials: rec.testimonials || [],
        logo:         rec.logo         || '',
        automations:  rec.automations  || [],
        partners:     rec.partners     || [],
        socials:      rec.socials      || {},
        team:         rec.team         || [],
        pending_voice: rec.pending_voice || null,
      }
    } catch { return { works: [], testimonials: [], logo: '', automations: [], partners: [], socials: {}, pending_voice: null } }
  }

  async function saveData(binUrl, data) {
    try {
      const r = await fetch(binUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Key': BIN_KEY,
          'X-Bin-Private': 'false'
        },
        body: JSON.stringify(data)
      })
      const result = await r.json()
      if (!r.ok) {
        console.error('saveData failed:', r.status, JSON.stringify(result))
        return false
      }
      return true
    } catch(e) {
      console.error('saveData error:', e.message)
      return false
    }
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
    const isKarios = siteKey === 'karios'
    const rows = [
      [{ text: '➕ Add item',         callback_data:  `help_add_${siteKey}`    }],
      [{ text: '⭐ Add review',        callback_data:  `help_testi_${siteKey}`  }],
      [{ text: '🖼 Set logo',          callback_data:  `help_logo_${siteKey}`   }],
      [{ text: '📋 List items',        callback_data:  `list_${siteKey}`        }],
      [{ text: '🗑 Delete item',       callback_data:  `dellist_${siteKey}`     }],
      [{ text: '🗑 Delete review',     callback_data:  `deltestilist_${siteKey}` }],
    ]
    if (isKarios) {
      rows.push([{ text: '🎬 Add automation video', callback_data: 'help_auto' }])
      rows.push([{ text: '🤝 Add partner/friend',   callback_data: 'help_partner' }])
      rows.push([{ text: '🔗 Update social links',  callback_data: 'help_socials' }])
      rows.push([{ text: ' Delete automation',    callback_data: 'delautomation' }])
      rows.push([{ text: ' Delete partner',       callback_data: 'delpartner'    }])
      rows.push([{ text: '👥 Add team member',      callback_data: 'help_team'     }])
      rows.push([{ text: '🗑 Delete team member',   callback_data: 'delteamlist'   }])
    }
    rows.push([{ text: '🔀 Switch site', callback_data: 'switch_site' }])
    return rows
  }

  // ── CALLBACKS ──
  if (callback) {
    const chatId  = callback.message.chat.id
    const userId  = String(callback.from?.id || '')
    const data    = callback.data || ''
    const isAdmin = userId === ADMIN_ID

    if (!isAdmin) { await send(chatId, '⛔ Not authorised.'); return res.status(200).send('OK') }

    if (data === 'goto_karios' || data === 'goto_mamas') {
      const siteKey = data.replace('goto_', '')
      const site    = SITES[siteKey]
      await send(chatId, `${site.emoji} <b>Now managing: ${site.name}</b>\n\nWhat would you like to do?`, siteMenu(siteKey))
      return res.status(200).send('OK')
    }
    if (data === 'switch_site') {
      await send(chatId, 'Which site?', siteKeyboard())
      return res.status(200).send('OK')
    }
    if (data === 'help_auto') {
      await send(chatId, `<b>Add an automation video:</b>\nSend a photo (thumbnail) with caption:\n<code>auto: Title | Description | VideoURL</code>\n<b>Example:</b>\n<code>auto: Restaurant Menu Update | Send a message, website updates instantly | https://tiktok.com/...</code>\nFor YouTube use the full URL. For TikTok use the share link.`)
      return res.status(200).send('OK')
    }
    if (data === 'help_partner') {
      await send(chatId, `<b>Add a partner/friend profile:</b>\nSend their photo with caption:\n<code>partner: Name | What they do | FiverrLink</code>\n<b>Example:</b>\n<code>partner: John Doe | Logo & Brand Design | https://fiverr.com/johndoe</code>`)
      return res.status(200).send('OK')
    }
    if (data === 'help_team') {
      await send(chatId, `<b>Add a team member:</b>\nSend their photo with caption:\n<code>team: Name | Role | Email | LinkedIn or website (optional)</code>\n<b>Example:</b>\n<code>team: Karios | Founder & Lead Strategist | hello@kariosagency.com | https://linkedin.com/in/karios</code>`)
      return res.status(200).send('OK')
    }
    if (data === 'delteamlist') {
      const db = await getData(KARIOS_BIN)
      const team = db.team || []
      if (!team.length) { await send(chatId, 'No team members yet.'); return res.status(200).send('OK') }
      const keyboard = team.map((m,i) => [{ text: `🗑 ${m.name}`, callback_data: `delteam_${i}` }])
      await send(chatId, 'Which team member to remove?', keyboard)
      return res.status(200).send('OK')
    }
    if (data.startsWith('delteam_')) {
      const idx = parseInt(data.replace('delteam_', ''))
      const db  = await getData(KARIOS_BIN)
      if (!isNaN(idx) && idx < (db.team||[]).length) {
        const removed = db.team.splice(idx, 1)[0]
        await saveData(KARIOS_BIN, db)
        await send(chatId, `✅ Removed team member: <b>${removed.name}</b>`)
      }
      return res.status(200).send('OK')
    }
    if (data === 'help_socials') {
      await send(chatId, `<b>Update your social/contact links:</b>\nSend a text message in this format:\n<code>socials: fiverr=URL, linkedin=URL, twitter=URL, instagram=URL, youtube=URL</code>\n<b>Example:</b>\n<code>socials: fiverr=https://fiverr.com/karios, linkedin=https://linkedin.com/in/karios, instagram=https://instagram.com/kariosagency</code>\nOnly include the ones you have. Others will stay unchanged.`)
      return res.status(200).send('OK')
    }
    if (data === 'delautomation') {
      const db = await getData(KARIOS_BIN)
      if (!db.automations.length) { await send(chatId, 'No automations to delete.'); return res.status(200).send('OK') }
      const keyboard = db.automations.map((a,i) => [{ text: `🗑 ${a.title}`, callback_data: `delauto_${i}` }])
      await send(chatId, 'Which automation to remove?', keyboard)
      return res.status(200).send('OK')
    }
    if (data === 'delpartner') {
      const db = await getData(KARIOS_BIN)
      if (!db.partners.length) { await send(chatId, 'No partners to delete.'); return res.status(200).send('OK') }
      const keyboard = db.partners.map((p,i) => [{ text: `🗑 ${p.name}`, callback_data: `delpartner_${i}` }])
      await send(chatId, 'Which partner to remove?', keyboard)
      return res.status(200).send('OK')
    }
    if (data.startsWith('delauto_')) {
      const idx = parseInt(data.replace('delauto_', ''))
      const db  = await getData(KARIOS_BIN)
      if (!isNaN(idx) && idx < db.automations.length) {
        const removed = db.automations.splice(idx, 1)[0]
        await saveData(KARIOS_BIN, db)
        await send(chatId, `✅ Removed automation: <b>${removed.title}</b>`)
      }
      return res.status(200).send('OK')
    }
    if (data.startsWith('delpartner_')) {
      const idx = parseInt(data.replace('delpartner_', ''))
      const db  = await getData(KARIOS_BIN)
      if (!isNaN(idx) && idx < db.partners.length) {
        const removed = db.partners.splice(idx, 1)[0]
        await saveData(KARIOS_BIN, db)
        await send(chatId, `✅ Removed partner: <b>${removed.name}</b>`)
      }
      return res.status(200).send('OK')
    }
    if (data.startsWith('help_add_')) {
      const siteKey = data.replace('help_add_', '')
      const site    = SITES[siteKey]
      await send(chatId, `<b>Add item to ${site.name}:</b>\n\nSend a photo with caption:\n<code>${site.itemFormat}</code>\n\nStart caption with <b>${siteKey}:</b>\n\n<b>Example:</b>\n<code>${siteKey}: ${site.itemExample}</code>`)
      return res.status(200).send('OK')
    }
    if (data.startsWith('help_testi_')) {
      const siteKey = data.replace('help_testi_', '')
      await send(chatId, `<b>Add review:</b>\n\nSend a photo with caption starting with:\n<code>${siteKey} testimonial: Name | Business | "Quote"</code>\n\n<b>Example:</b>\n<code>${siteKey} testimonial: John | Lagos Bistro | "Amazing food!"</code>`)
      return res.status(200).send('OK')
    }
    if (data.startsWith('help_logo_')) {
      const siteKey = data.replace('help_logo_', '')
      await send(chatId, `<b>Set logo:</b>\n\nSend a photo with caption:\n<code>${siteKey} logo</code>`)
      return res.status(200).send('OK')
    }
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
  let text      = msg.text    || ''
  const caption = (msg.caption || '').trim()
  const photo   = msg.photo
  const isAdmin = userId === ADMIN_ID

  // Block non-admins
  if (!text.startsWith('/start') && !isAdmin && !msg.voice && !msg.audio && !photo) {
    await send(chatId, `⛔ This bot is private.\n\nContact: t.me/kariosagency`)
    return res.status(200).send('OK')
  }

  // /start
  if (text.startsWith('/start')) {
    await send(chatId, ` <b>Multi-Site Manager</b>\n\nWhich website do you want to manage?`, siteKeyboard())
    return res.status(200).send('OK')
  }

  // ── VOICE NOTE / AUDIO HANDLING (The Magic Trick) ──
  if (msg.voice || msg.audio) {
    if (!isAdmin) { await send(chatId, '⛔ Not authorised.'); return res.status(200).send('OK') }
    
    const fileId = msg.voice ? msg.voice.file_id : msg.audio.file_id;
    await send(chatId, '⏳ Listening to your voice note...');

    try {
      const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
      const fileData = await fileRes.json();
      if (!fileData.ok) throw new Error('Failed to get file info');
      
      const filePath = fileData.result.file_path;
      const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

      const audioRes = await fetch(fileUrl);
      const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

      const formData = new FormData();
      formData.append('file', new Blob([audioBuffer]), 'voice.ogg');
      formData.append('model', 'whisper-large-v3-turbo');
      formData.append('response_format', 'text');

      if (!process.env.GROQ_API_KEY) {
        await send(chatId, '⚠️ Server error: Missing GROQ_API_KEY. Please contact the developer.');
        return res.status(200).send('OK');
      }

      const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
        body: formData
      });
      
      if (!groqRes.ok) {
        const errText = await groqRes.text();
        console.error('Groq API Error:', groqRes.status, errText);
        throw new Error('Groq API failed');
      }

      const transcribedText = (await groqRes.text()).trim();
      
      if (!transcribedText) {
        await send(chatId, '⚠️ Could not understand the voice note. Please try again or type it out.');
        return res.status(200).send('OK');
      }

      // Save to pending_voice in the default site (mamas) for now
      const defaultSite = SITES.mamas;
      const db = await getData(defaultSite.binUrl);
      db.pending_voice = { text: transcribedText, site: 'mamas', timestamp: Date.now() };
      await saveData(defaultSite.binUrl, db);

      await send(chatId, `🎙 Heard: "${transcribedText}"\n\n<b>Do you want to add a photo to this special?</b>\n- Send a photo now to attach it.\n- Reply NO to publish as text-only.`);
      return res.status(200).send('OK');
      
    } catch (e) {
      console.error('Voice processing error:', e);
      await send(chatId, '⚠️ Error processing voice note. Please try again.');
      return res.status(200).send('OK');
    }
  }

  // ── PHOTO HANDLING (Check for pending voice note) ──
  if (photo) {
    if (!isAdmin) { await send(chatId, ' Not authorised.'); return res.status(200).send('OK') }
    
    // Check if there's a pending voice note
    const defaultSite = SITES.mamas;
    const db = await getData(defaultSite.binUrl);
    
    if (db.pending_voice && (Date.now() - db.pending_voice.timestamp < 300000)) { // 5 min window
      const pending = db.pending_voice;
      await send(chatId, ' Uploading photo and attaching to special...');
      
      const fileId      = photo[photo.length-1].file_id
      const telegramUrl = await getPhotoUrl(fileId)
      const imgUrl      = await uploadToCloudinary(telegramUrl) || telegramUrl
      
      const parts = pending.text.split('|').map(s => s.trim());
      const title   = parts[0] || 'Daily Special';
      const tag     = parts[1] || 'Today';
      const result1 = parts[2] || ''; 
      const result2 = parts[3] || ''; 

      db.works.unshift({ 
        id: Date.now(), 
        title, 
        tag, 
        result1, 
        result2, 
        imgUrl, 
        addedAt: new Date().toISOString() 
      });
      delete db.pending_voice;
      const saved = await saveData(defaultSite.binUrl, db);
      
      await send(chatId, saved 
        ? `✅ <b>Daily Special Updated with Photo!</b>\n\n <b>${title}</b>\n${tag ? `🏷 ${tag}\n` : ''}${result1 ? `💰 ${result1}\n` : ''}${result2 ? `📝 ${result2}` : ''}`
        : `️ Could not save.`
      );
      return res.status(200).send('OK');
    }

    // Normal photo + caption flow (existing code)
    if (!caption) {
      await send(chatId, `⚠️ Please add a caption to your photo.\n\n<code>mamas: Dish | Tag | Price | Description</code>`);
      return res.status(200).send('OK');
    }

    let siteKey = null
    let cleanCaption = caption
    for (const key of Object.keys(SITES)) {
      if (caption.toLowerCase().startsWith(key + ':') || caption.toLowerCase().startsWith(key + ' ')) {
        siteKey      = key
        cleanCaption = caption.slice(key.length).replace(/^[\s:]+/, '').trim()
        break
      }
    }
    if (!siteKey) {
      await send(chatId, `⚠️ Please start your caption with the site name:\n\n<code>karios: Title | Tag | Result1 | Result2</code>\n<code>mamas: Dish | Tag | Price | Description</code>`)
      return res.status(200).send('OK')
    }
    const site = SITES[siteKey]
    const isLogo        = cleanCaption.toLowerCase() === 'logo'
    const isTestimonial = cleanCaption.toLowerCase().startsWith('testimonial:')
    await send(chatId, '⏳ Uploading...')
    const fileId      = photo[photo.length-1].file_id
    const telegramUrl = await getPhotoUrl(fileId)
    const imgUrl      = await uploadToCloudinary(telegramUrl) || telegramUrl
    const db2          = await getData(site.binUrl)
    
    if (isLogo) {
      db2.logo = imgUrl
      await saveData(site.binUrl, db2)
      await send(chatId, `✅ Logo updated for <b>${site.name}</b>!`)
      return res.status(200).send('OK')
    }
    if (isTestimonial) {
      const clean = cleanCaption.replace(/^testimonial:\s*/i, '')
      const parts = clean.split('|').map(s => s.trim())
      const name  = parts[0] || 'Client'
      const biz   = parts[1] || ''
      const quote = (parts[2] || '').replace(/^["']|["']$/g, '').trim()
      db2.testimonials.unshift({ id: Date.now(), name, business: biz, quote, imgUrl, addedAt: new Date().toISOString() })
      const saved = await saveData(site.binUrl, db2)
      await send(chatId, saved ? `✅ <b>Review added to ${site.name}!</b>\n\n⭐ <b>${name}</b>${biz?` — ${biz}`:''}\n${quote?`"${quote}"`:''}` : `⚠️ Could not save.`)
      return res.status(200).send('OK')
    }
    // Regular item
    const parts   = cleanCaption.split('|').map(s => s.trim())
    const title   = parts[0] || 'New Item'
    const tag     = parts[1] || ''
    const result1 = parts[2] || ''
    const result2 = parts[3] || ''
    db2.works.unshift({ id: Date.now(), title, tag, result1, result2, imgUrl, addedAt: new Date().toISOString() })
    const saved = await saveData(site.binUrl, db2)
    await send(chatId, saved ? `✅ <b>Added to ${site.name}!</b>\n\n📌 <b>${title}</b>\n${tag?`🏷 ${tag}\n`:''}${result1?`💰 ${result1}\n`:''}${result2?`📝 ${result2}`:''}` : `⚠️ Could not save.`)
    return res.status(200).send('OK')
  }

  // ── TEXT HANDLING (Check for "NO" to publish pending voice) ─
  if (text && text.toLowerCase() === 'no') {
    const defaultSite = SITES.mamas;
    const db = await getData(defaultSite.binUrl);
    if (db.pending_voice && (Date.now() - db.pending_voice.timestamp < 300000)) {
      const pending = db.pending_voice;
      const parts = pending.text.split('|').map(s => s.trim());
      const title   = parts[0] || 'Daily Special';
      const tag     = parts[1] || 'Today';
      const result1 = parts[2] || ''; 
      const result2 = parts[3] || ''; 

      db.works.unshift({ 
        id: Date.now(), 
        title, 
        tag, 
        result1, 
        result2, 
        imgUrl: '', 
        addedAt: new Date().toISOString() 
      });
      delete db.pending_voice;
      const saved = await saveData(defaultSite.binUrl, db);
      
      await send(chatId, saved 
        ? `✅ <b>Daily Special Published (Text-Only)!</b>\n\n <b>${title}</b>\n${tag ? `🏷 ${tag}\n` : ''}${result1 ? `💰 ${result1}\n` : ''}${result2 ? `📝 ${result2}` : ''}`
        : `️ Could not save.`
      );
      return res.status(200).send('OK');
    }
  }

  // Unknown text
  if (text && !text.startsWith('/')) {
    await send(chatId, `Use /start to pick a site and see options, or send a photo with a caption.`);
  }
  
  res.status(200).send('OK')
}