// api/works.js - Returns portfolio works AND testimonials

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store')

  const BIN_URL = process.env.JSONBIN_URL || ''
  const BIN_KEY = process.env.JSONBIN_KEY || ''

  if (!BIN_URL) return res.status(200).json({ works: [], testimonials: [] })

  try {
    const r = await fetch(BIN_URL + '/latest', { headers: { 'X-Master-Key': BIN_KEY } })
    const d = await r.json()
    res.status(200).json({
      works:        d.record?.works        || [],
      testimonials: d.record?.testimonials || [],
    })
  } catch(e) {
    res.status(200).json({ works: [], testimonials: [] })
  }
}
