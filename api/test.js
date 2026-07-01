// api/test.js - temporary debug endpoint
module.exports = async (req, res) => {
  const BIN_KEY = process.env.JSONBIN_KEY || 'NOT SET'
  const BIN_URL = 'https://api.jsonbin.io/v3/b/6a4412b7da38895dfe17b1f7'

  try {
    // Try to read
    const r = await fetch(BIN_URL + '/latest', {
      headers: { 'X-Master-Key': BIN_KEY }
    })
    const d = await r.json()

    // Try to write test data
    const w = await fetch(BIN_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Master-Key': BIN_KEY },
      body: JSON.stringify({ works: [{ id: 1, title: 'TEST', tag: 'test', result1: '$10', result2: 'desc', imgUrl: '', addedAt: new Date().toISOString() }], testimonials: [], logo: '' })
    })
    const wd = await w.json()

    res.status(200).json({
      keyLength: BIN_KEY.length,
      keyStart: BIN_KEY.slice(0, 10),
      readStatus: r.status,
      readData: d,
      writeStatus: w.status,
      writeData: wd
    })
  } catch(e) {
    res.status(200).json({ error: e.message })
  }
}
