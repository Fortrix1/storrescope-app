// api/bot.js - COMPLETE & CLEAN VERSION
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
      name: 'Karios Agency', emoji: '⚡',
      binUrl: KARIOS_BIN,
      itemFormat: 'Title | Tag | Result 1 | Result 2',
      itemExample: 'Fashion Store Lagos | SEO Fix | 0→12 sales | +340% traffic',
    },
    mamas: {
      name: "Mama's Kitchen", emoji: '️',
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
    } catch { return { works: [], testimonials: [], logo: '', automations: [], partners: [], socials: {}, team: [], pending_voice: null } }
  }

  async function saveData(binUrl, data) {
    try {
      const r = await fetch(binUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Master-Key': BIN_KEY, 'X-Bin-Private': 'false' },
        body: JSON.stringify(data)
      })
      return r.ok
    } catch(e) { return false }
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
      const crypto = require('crypto')
      const timestamp = Math.floor(Date.now()/1000)
      const signature = crypto.createHash('sha1').update(`timestamp=${timestamp}${CLOUD_SECRET}`).digest('hex')
      const form = new URLSearchParams()
      form.append('file', url); form.append('api_key', CLOUD_KEY)
      form.append('timestamp', timestamp); form.append('signature', signature)
      const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString()
      })
      const d = await r.json()
      return d.secure_url || ''
    } catch { return '' }
  }

  // AI Edit Interpreter
  async function interpretEdit(originalText, instruction) {
    try {
      const formData = new FormData();
      formData.append('model', 'llama-3.1-70b-versatile');
      formData.append('messages', JSON.stringify([
        { role: 'system', content: 'You update restaurant menu items. Format: "Title | Tag | Price | Description". Return ONLY the updated text in the exact same format.' },
        { role: 'user', content: `Original: "${originalText}"\nInstruction: "${instruction}"` }
      ]));
      formData.append('max_tokens', '200');
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` }, body: formData
      });
      const d = await r.json();
      return d.choices[0].message.content.trim();
    } catch { return null }
  }

  function siteKeyboard() {
    return [
      [{ text: '⚡ Karios Agency', callback_data: 'goto_karios' }],
      [{ text: "🍽️ Mama's Kitchen", callback_data: 'goto_mamas' }],
    ]
  }

  function siteMenu(siteKey) {
    const isKarios = siteKey === 'karios'
    const rows = [
      [{ text: '➕ Add item', callback_data: `help_add_${siteKey}` }],
      [{ text: '⭐ Add review', callback_data: `help_testi_${siteKey}` }],
      [{ text: '🖼 Set logo', callback_data: `help_logo_${siteKey}` }],
      [{ text: '📋 List items', callback_data: `list_${siteKey}` }],
      [{ text: '🗑 Delete item', callback_data: `dellist_${siteKey}` }],
      [{ text: '🗑 Delete review', callback_data: `deltestilist_${siteKey}` }],
    ]
    if (isKarios) {
      rows.push([{ text: '🎬 Add automation', callback_data: 'help_auto' }])
      rows.push([{ text: '🤝 Add partner', callback_data: 'help_partner' }])
      rows.push([{ text: '🔗 Socials', callback_data: 'help_socials' }])
      rows.push([{ text: ' Add team', callback_data: 'help_team' }])
      rows.push([{ text: '🗑 Delete team', callback_data: 'delteamlist' }])
    }
    rows.push([{ text: '🔀 Switch site', callback_data: 'switch_site' }])
    return rows
  }

  function editKeyboard() {
    return [
      [{ text: '✅ OK - Publish Now', callback_data: 'edit_ok' }],
      [{ text: '✏️ Edit Again', callback_data: 'edit_again' }],
      [{ text: '❌ Cancel', callback_data: 'edit_cancel' }],
    ]
  }

  // ── CALLBACKS ──
  if (callback) {
    const chatId = callback.message.chat.id
    const userId = String(callback.from?.id || '')
    const data = callback.data || ''
    const isAdmin = userId === ADMIN_ID

    if (!isAdmin) { await send(chatId, ' Not authorised.'); return res.status(200).send('OK') }

    // NEW EDIT BUTTONS
    if (data === 'edit_ok') {
      const db = await getData(SITES.mamas.binUrl);
      if (db.pending_voice) {
        const { title, tag, result1, result2 } = db.pending_voice.parsed;
        const finalData = {
          works: [{ id: Date.now(), title, tag, result1, result2, imgUrl: db.pending_voice.imgUrl || '', addedAt: new Date().toISOString() }, ...(db.works || [])],
          testimonials: db.testimonials || [], logo: db.logo || '', automations: db.automations || [],
          partners: db.partners || [], socials: db.socials || {}, team: db.team || []
        };
        await saveData(SITES.mamas.binUrl, finalData);
        await send(chatId, `✅ <b>Published!</b>\n\n📌 <b>${title}</b>\n${tag ? `🏷 ${tag}\n` : ''}${result1 ? `💰 ${result1}\n` : ''}${result2 ? `📝 ${result2}` : ''}`);
      }
      return res.status(200).send('OK');
    }

    if (data === 'edit_again') {
      await send(chatId, '🎙 <b>Send a voice note with your edit instructions</b>\n\nExamples:\n• "Change price to $15"\n• "Make it jollof rice"\n• "Add spicy to description"');
      return res.status(200).send('OK');
    }

    if (data === 'edit_cancel') {
      const db = await getData(SITES.mamas.binUrl);
      delete db.pending_voice;
      await saveData(SITES.mamas.binUrl, db);
      await send(chatId, '❌ Cancelled.');
      return res.status(200).send('OK');
    }

    // EXISTING CALLBACKS
    if (data === 'goto_karios' || data === 'goto_mamas') {
      const siteKey = data.replace('goto_', '')
      await send(chatId, `${SITES[siteKey].emoji} <b>Now managing: ${SITES[siteKey].name}</b>\n\nWhat would you like to do?`, siteMenu(siteKey))
      return res.status(200).send('OK')
    }
    if (data === 'switch_site') { await send(chatId, 'Which site?', siteKeyboard()); return res.status(200).send('OK') }
    if (data === 'help_auto') { await send(chatId, `<b>Add automation:</b>\nSend photo with caption:\n<code>auto: Title | Desc | URL</code>`); return res.status(200).send('OK') }
    if (data === 'help_partner') { await send(chatId, `<b>Add partner:</b>\nSend photo with caption:\n<code>partner: Name | Role | Link</code>`); return res.status(200).send('OK') }
    if (data === 'help_team') { await send(chatId, `<b>Add team:</b>\nSend photo with caption:\n<code>team: Name | Role | Email | Link</code>`); return res.status(200).send('OK') }
    if (data === 'help_socials') { await send(chatId, `<b>Update socials:</b>\n<code>socials: fiverr=URL, instagram=URL</code>`); return res.status(200).send('OK') }
    
    if (data === 'delteamlist') {
      const db = await getData(KARIOS_BIN); const team = db.team || []
      if (!team.length) { await send(chatId, 'No team members.'); return res.status(200).send('OK') }
      await send(chatId, 'Which to remove?', team.map((m,i) => [{ text: `🗑 ${m.name}`, callback_data: `delteam_${i}` }]))
      return res.status(200).send('OK')
    }
    if (data.startsWith('delteam_')) {
      const idx = parseInt(data.replace('delteam_', '')); const db = await getData(KARIOS_BIN)
      if (!isNaN(idx) && idx < (db.team||[]).length) { db.team.splice(idx, 1); await saveData(KARIOS_BIN, db); await send(chatId, '✅ Removed.') }
      return res.status(200).send('OK')
    }
    if (data === 'delautomation') {
      const db = await getData(KARIOS_BIN)
      if (!db.automations.length) { await send(chatId, 'None.'); return res.status(200).send('OK') }
      await send(chatId, 'Which?', db.automations.map((a,i) => [{ text: ` ${a.title}`, callback_data: `delauto_${i}` }]))
      return res.status(200).send('OK')
    }
    if (data === 'delpartner') {
      const db = await getData(KARIOS_BIN)
      if (!db.partners.length) { await send(chatId, 'None.'); return res.status(200).send('OK') }
      await send(chatId, 'Which?', db.partners.map((p,i) => [{ text: `🗑 ${p.name}`, callback_data: `delpartner_${i}` }]))
      return res.status(200).send('OK')
    }
    if (data.startsWith('delauto_')) {
      const idx = parseInt(data.replace('delauto_', '')); const db = await getData(KARIOS_BIN)
      if (!isNaN(idx) && idx < db.automations.length) { db.automations.splice(idx, 1); await saveData(KARIOS_BIN, db); await send(chatId, '✅ Removed.') }
      return res.status(200).send('OK')
    }
    if (data.startsWith('delpartner_')) {
      const idx = parseInt(data.replace('delpartner_', '')); const db = await getData(KARIOS_BIN)
      if (!isNaN(idx) && idx < db.partners.length) { db.partners.splice(idx, 1); await saveData(KARIOS_BIN, db); await send(chatId, '✅ Removed.') }
      return res.status(200).send('OK')
    }
    if (data.startsWith('help_add_')) {
      const siteKey = data.replace('help_add_', ''); const site = SITES[siteKey]
      await send(chatId, `<b>Add to ${site.name}:</b>\nSend photo with caption:\n<code>${siteKey}: ${site.itemFormat}</code>\nExample: <code>${siteKey}: ${site.itemExample}</code>`)
      return res.status(200).send('OK')
    }
    if (data.startsWith('help_testi_')) {
      const siteKey = data.replace('help_testi_', '')
      await send(chatId, `<b>Add review:</b>\n<code>${siteKey} testimonial: Name | Biz | "Quote"</code>`)
      return res.status(200).send('OK')
    }
    if (data.startsWith('help_logo_')) {
      const siteKey = data.replace('help_logo_', '')
      await send(chatId, `<b>Set logo:</b>\nSend photo with caption: <code>${siteKey} logo</code>`)
      return res.status(200).send('OK')
    }
    if (data.startsWith('list_')) {
      const siteKey = data.replace('list_', ''); const site = SITES[siteKey]; const db = await getData(site.binUrl)
      if (!db.works.length) { await send(chatId, 'No items.'); return res.status(200).send('OK') }
      let list = `<b>${site.name} items:</b>\n\n`
      db.works.forEach((w,i) => { list += `${i+1}. <b>${w.title}</b> — ${w.tag}\n` })
      await send(chatId, list); return res.status(200).send('OK')
    }
    if (data.startsWith('dellist_')) {
      const siteKey = data.replace('dellist_', ''); const site = SITES[siteKey]; const db = await getData(site.binUrl)
      if (!db.works.length) { await send(chatId, 'Nothing.'); return res.status(200).send('OK') }
      const kb = db.works.map((w,i) => [{ text: `🗑 ${w.title}`, callback_data: `delwork_${siteKey}_${i}` }])
      kb.push([{ text: '← Back', callback_data: `goto_${siteKey}` }])
      await send(chatId, 'Remove which?', kb); return res.status(200).send('OK')
    }
    if (data.startsWith('deltestilist_')) {
      const siteKey = data.replace('deltestilist_', ''); const site = SITES[siteKey]; const db = await getData(site.binUrl)
      if (!db.testimonials.length) { await send(chatId, 'Nothing.'); return res.status(200).send('OK') }
      const kb = db.testimonials.map((t,i) => [{ text: `🗑 ${t.name}`, callback_data: `deltesti_${siteKey}_${i}` }])
      kb.push([{ text: '← Back', callback_data: `goto_${siteKey}` }])
      await send(chatId, 'Remove which?', kb); return res.status(200).send('OK')
    }
    if (data.startsWith('delwork_')) {
      const parts = data.split('_'); const siteKey = parts[1]; const idx = parseInt(parts[2]); const site = SITES[siteKey]; const db = await getData(site.binUrl)
      if (!isNaN(idx) && idx >= 0 && idx < db.works.length) { db.works.splice(idx, 1); await saveData(site.binUrl, db); await send(chatId, '✅ Removed.') }
      return res.status(200).send('OK')
    }
    if (data.startsWith('deltesti_')) {
      const parts = data.split('_'); const siteKey = parts[1]; const idx = parseInt(parts[2]); const site = SITES[siteKey]; const db = await getData(site.binUrl)
      if (!isNaN(idx) && idx >= 0 && idx < db.testimonials.length) { db.testimonials.splice(idx, 1); await saveData(site.binUrl, db); await send(chatId, '✅ Removed.') }
      return res.status(200).send('OK')
    }
    return res.status(200).send('OK')
  }

  if (!msg) return res.status(200).send('OK')
  
  const chatId = msg.chat.id
  const userId = String(msg.from?.id || '')
  let text = msg.text || ''
  const caption = (msg.caption || '').trim()
  const photo = msg.photo
  const isAdmin = userId === ADMIN_ID

  if (!text.startsWith('/start') && !isAdmin && !msg.voice && !msg.audio && !photo) {
    await send(chatId, '⛔ Private bot.')
    return res.status(200).send('OK')
  }

  if (text.startsWith('/start')) {
    await send(chatId, '👋 <b>Multi-Site Manager</b>\n\nWhich site?', siteKeyboard())
    return res.status(200).send('OK')
  }

  // ── PHOTO HANDLING ──
  if (photo && isAdmin) {
    const db = await getData(SITES.mamas.binUrl);
    
    // Attach to pending voice
    if (db.pending_voice) {
      await send(chatId, '⏳ Uploading photo...');
      const fileId = photo[photo.length-1].file_id;
      const telegramUrl = await getPhotoUrl(fileId);
      const imgUrl = await uploadToCloudinary(telegramUrl) || telegramUrl;
      db.pending_voice.imgUrl = imgUrl;
      await saveData(SITES.mamas.binUrl, db);
      await send(chatId, '✅ Photo attached! Click OK to publish.', editKeyboard());
      return res.status(200).send('OK');
    }
    
    // Normal photo flow
    if (!caption) { await send(chatId, '️ Add a caption: <code>mamas: Dish | Tag | Price | Desc</code>'); return res.status(200).send('OK') }
    let siteKey = null; let cleanCaption = caption;
    for (const key of Object.keys(SITES)) {
      if (caption.toLowerCase().startsWith(key + ':') || caption.toLowerCase().startsWith(key + ' ')) {
        siteKey = key; cleanCaption = caption.slice(key.length).replace(/^[\s:]+/, '').trim(); break
      }
    }
    if (!siteKey) { await send(chatId, '⚠️ Start with site name: <code>mamas: ...</code>'); return res.status(200).send('OK') }
    const site = SITES[siteKey]; await send(chatId, '⏳ Uploading...');
    const fileId = photo[photo.length-1].file_id;
    const telegramUrl = await getPhotoUrl(fileId);
    const imgUrl = await uploadToCloudinary(telegramUrl) || telegramUrl;
    const currentDb = await getData(site.binUrl);
    const parts = cleanCaption.split('|').map(s => s.trim());
    const finalData = {
      works: [{ id: Date.now(), title: parts[0]||'Item', tag: parts[1]||'', result1: parts[2]||'', result2: parts[3]||'', imgUrl, addedAt: new Date().toISOString() }, ...(currentDb.works || [])],
      testimonials: currentDb.testimonials || [], logo: currentDb.logo || '', automations: currentDb.automations || [],
      partners: currentDb.partners || [], socials: currentDb.socials || {}, team: currentDb.team || []
    }
    await saveData(site.binUrl, finalData);
    await send(chatId, `✅ Added to ${site.name}!`);
    return res.status(200).send('OK')
  }

  // ── VOICE NOTE HANDLING ──
  if ((msg.voice || msg.audio) && isAdmin) {
    const db = await getData(SITES.mamas.binUrl);
    const fileId = msg.voice ? msg.voice.file_id : msg.audio.file_id;
    await send(chatId, '⏳ Listening...');

    try {
      const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
      const fileData = await fileRes.json();
      const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
      const audioRes = await fetch(fileUrl);
      const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
      const formData = new FormData();
      formData.append('file', new Blob([audioBuffer]), 'voice.ogg');
      formData.append('model', 'whisper-large-v3-turbo');
      formData.append('response_format', 'text');
      const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST', headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` }, body: formData
      });
      const transcribedText = (await groqRes.text()).trim();
      if (!transcribedText) { await send(chatId, '⚠️ Could not understand.'); return res.status(200).send('OK') }

      // EDIT MODE: If pending_voice exists, treat as edit instruction
      if (db.pending_voice) {
        await send(chatId, ' AI is interpreting your edit...');
        const editedText = await interpretEdit(db.pending_voice.text, transcribedText);
        if (editedText) {
          const parts = editedText.split('|').map(s => s.trim());
          db.pending_voice = {
            text: editedText, site: 'mamas', timestamp: Date.now(),
            parsed: { title: parts[0]||'Special', tag: parts[1]||'Today', result1: parts[2]||'', result2: parts[3]||'' },
            imgUrl: db.pending_voice.imgUrl
          };
          await saveData(SITES.mamas.binUrl, db);
          const preview = `🔄 <b>Edited Preview:</b>\n\n📌 <b>${db.pending_voice.parsed.title}</b>\n${db.pending_voice.parsed.tag ? `🏷 ${db.pending_voice.parsed.tag}\n` : ''}${db.pending_voice.parsed.result1 ? `💰 ${db.pending_voice.parsed.result1}\n` : ''}${db.pending_voice.parsed.result2 ? `📝 ${db.pending_voice.parsed.result2}` : ''}`;
          await send(chatId, preview, editKeyboard());
        } else {
          await send(chatId, '️ AI could not understand the edit. Try again.');
        }
        return res.status(200).send('OK');
      }

      // NORMAL MODE: New voice note
      const parts = transcribedText.split('|').map(s => s.trim());
      const title = parts[0] || 'Daily Special'; const tag = parts[1] || 'Today';
      const result1 = parts[2] || ''; const result2 = parts[3] || '';
      db.pending_voice = {
        text: transcribedText, site: 'mamas', timestamp: Date.now(),
        parsed: { title, tag, result1, result2 }, imgUrl: ''
      };
      await saveData(SITES.mamas.binUrl, db);
      const preview = `🎙 <b>Heard:</b> "${transcribedText}"\n\n📋 <b>Preview:</b>\n📌 <b>${title}</b>\n${tag ? `🏷 ${tag}\n` : ''}${result1 ? `💰 ${result1}\n` : ''}${result2 ? `📝 ${result2}` : ''}\n\n<i>What would you like to do?</i>`;
      await send(chatId, preview, editKeyboard());
      return res.status(200).send('OK');
    } catch (e) {
      console.error('Voice error:', e);
      await send(chatId, '⚠️ Error processing voice.');
      return res.status(200).send('OK');
    }
  }

  // ── TEXT COMMANDS ──
  if (text && isAdmin) {
    if (text.toLowerCase() === '/cancel') {
      const db = await getData(SITES.mamas.binUrl); delete db.pending_voice; await saveData(SITES.mamas.binUrl, db);
      await send(chatId, '❌ Cancelled.'); return res.status(200).send('OK');
    }
  }

  res.status(200).send('OK')
}