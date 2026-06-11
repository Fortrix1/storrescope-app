// api/works.js
// Returns portfolio works stored via Telegram bot
// Called by about.html to load dynamic portfolio

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store')

  const JSONBIN_URL = process.env.JSONBIN_URL || ''
  const JSONBIN_KEY = process.env.JSONBIN_KEY || ''

  if (!JSONBIN_URL) {
    // Return default works if not configured
    return res.status(200).json({ works: [] })
  }

  try {
    const r = await fetch(JSONBIN_URL + '/latest', {
      headers: { 'X-Master-Key': JSONBIN_KEY }
    })
    const d = await r.json()
    res.status(200).json({ works: d.record?.works || [] })
  } catch(e) {
    res.status(200).json({ works: [] })
  }
}
