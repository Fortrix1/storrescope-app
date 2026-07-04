// api/works.js - Karios Agency data endpoint

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store')

  const BIN_URL = process.env.JSONBIN_URL || 'https://api.jsonbin.io/v3/b/6a2b9c8ff5f4af5e29e4612d'
  const BIN_KEY = process.env.JSONBIN_KEY || ''

  try {
    const r = await fetch(BIN_URL + '/latest', { headers: { 'X-Master-Key': BIN_KEY } })
    const d = await r.json()
    const rec = d.record || {}
    res.status(200).json({
      works:        rec.works        || [],
      testimonials: rec.testimonials || [],
      logo:         rec.logo         || '',
      automations:  rec.automations  || [],
      partners:     rec.partners     || [],
      socials:      rec.socials      || {},
    })
  } catch(e) {
    res.status(200).json({ works: [], testimonials: [], logo: '', automations: [], partners: [], socials: {} })
  }
}
