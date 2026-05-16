// api/analyse.js
// Vercel serverless function — store analysis engine

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  let url
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    url = body?.url
  } catch {
    return res.status(400).json({ error: 'Invalid request' })
  }

  if (!url) return res.status(400).json({ error: 'No URL' })

  try {
    const result = await analyseStore(url)
    res.status(200).json(result)
  } catch(e) {
    res.status(500).json({ error: e.message })
  }
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
}

async function safeFetch(url) {
  try {
    const r = await fetch(url, {
      headers: HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    })
    return r
  } catch { return null }
}

async function safeText(url) {
  const r = await safeFetch(url)
  if (!r || !r.ok) return ''
  return r.text().catch(() => '')
}

function extractMeta(html, name) {
  const patterns = [
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, 'i'),
  ]
  for (const p of patterns) {
    const m = html.match(p)
    if (m) return m[1].trim()
  }
  return ''
}

function hasPattern(html, patterns) {
  return patterns.some(p => html.toLowerCase().includes(p.toLowerCase()))
}

function detectPlatform(html) {
  if (html.includes('cdn.shopify.com') || html.includes('myshopify.com')) return 'Shopify'
  if (html.includes('wix.com') || html.includes('wixsite.com')) return 'Wix'
  if (html.includes('wp-content') || html.includes('wordpress')) return 'WordPress'
  if (html.includes('squarespace.com')) return 'Squarespace'
  if (html.includes('bigcommerce')) return 'BigCommerce'
  if (html.includes('webflow')) return 'Webflow'
  return 'Custom'
}

function detectNiche(html) {
  const t = html.toLowerCase()
  const niches = [
    ['Fashion & Clothing', ['shirt','dress','hoodie','clothing','fashion','wear','jacket','tee']],
    ['Jewelry & Accessories', ['jewelry','necklace','ring','bracelet','earring']],
    ['Beauty & Skincare', ['skin','beauty','serum','cream','lotion','glow','makeup']],
    ['Home & Decor', ['home','decor','candle','wall','pillow','mug']],
    ['Digital Products', ['digital','ebook','template','course','printable','download']],
    ['Pet Products', ['pet','dog','cat','animal']],
    ['Food & Drink', ['food','drink','tea','coffee','snack','sauce']],
    ['Fitness & Health', ['fitness','gym','workout','health','sport','yoga']],
  ]
  for (const [name, kws] of niches) {
    if (kws.some(k => t.includes(k))) return name
  }
  return 'General / Mixed'
}

async function getPageSpeed(url) {
  try {
    const api = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance`
    const r = await fetch(api, { signal: AbortSignal.timeout(12000) })
    if (!r.ok) return null
    const d = await r.json()
    const perf = Math.round((d.lighthouseResult?.categories?.performance?.score || 0) * 100)
    const fcp  = d.lighthouseResult?.audits?.['first-contentful-paint']?.numericValue || 0
    return { perf, mobile: perf, loadSpeed: parseFloat((fcp/1000).toFixed(1)) }
  } catch { return null }
}

async function estimateSpeed(html) {
  let score = 70
  if (html.length > 500000) score -= 20
  else if (html.length > 200000) score -= 10
  const scripts = (html.match(/<script/gi) || []).length
  if (scripts > 15) score -= 15
  else if (scripts > 8) score -= 8
  if (html.includes('async') || html.includes('defer')) score += 5
  if (html.includes('lazyload') || html.includes('data-src')) score += 5
  score = Math.max(10, Math.min(85, score))
  return { perf: score, mobile: Math.max(10, score-10), loadSpeed: score > 60 ? 2.1 : 4.2, estimated: true }
}

async function analyseStore(url) {
  const base = url.replace(/\/$/, '')

  const homeR = await safeFetch(base)
  if (!homeR || !homeR.ok) throw new Error('Could not reach store')
  const html = await homeR.text()

  const [seoData, productData, trustData, psData] = await Promise.all([
    checkSEO(base, html),
    checkProducts(base),
    checkTrust(base, html),
    getPageSpeed(base),
  ])

  const speedData    = psData || await estimateSpeed(html)
  const platform     = detectPlatform(html)
  const niche        = detectNiche(html)
  const adPlatform   = getAdPlatform(niche)
  const pagespeedScore = speedData.perf || 0
  const mobileScore    = speedData.mobile || 0
  const loadSpeed      = speedData.loadSpeed || 0
  const speedScore     = pagespeedScore
  const redesignNeeded = pagespeedScore < 40 || mobileScore < 40
  const productCount   = productData?.product_count || 0
  const isNewSeller    = productCount < 10 && !trustData.has_reviews

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const storeName  = titleMatch
    ? titleMatch[1].split('–')[0].split('|')[0].trim().slice(0, 50)
    : base.replace(/https?:\/\//, '').split('.')[0]

  const adData = checkAdReadiness({ trust: trustData, products: productData, speed: { perf: pagespeedScore }, niche, adPlatform })

  const scores = [speedScore, seoData.seo_score, productData?.products_score || 20, trustData.trust_score]
  const overallScore = Math.round(scores.reduce((a,b)=>a+b,0) / scores.length)

  const criticalData = buildCriticals({
    has_meta_description: seoData.has_meta_description,
    has_meta_title: seoData.has_meta_title,
    has_reviews: trustData.has_reviews,
    has_return_policy: trustData.has_return_policy,
    has_social: trustData.has_social,
    pagespeed_score: pagespeedScore,
    product_count: productCount,
    avg_images: productData?.avg_images || 0,
    redesign_needed: redesignNeeded,
  })

  return {
    store_name: storeName, platform, niche, is_new_seller: isNewSeller,
    overall_score: overallScore,
    speed_score: speedScore, pagespeed_score: pagespeedScore,
    mobile_score: mobileScore,
    load_speed: loadSpeed ? loadSpeed + 's' : 'Unknown',
    has_ssl: url.startsWith('https://'),
    redesign_needed: redesignNeeded,
    speed_estimated: speedData.estimated || false,
    ...seoData,
    products_score: productData?.products_score || 20,
    product_count: productCount,
    avg_desc_length: productData?.avg_desc_length || 'Unknown',
    avg_images: productData?.avg_images || 0,
    price_range: productData?.price_range || 'Unknown',
    best_ad_product: productData?.best_ad_product || '',
    ...trustData,
    ...adData,
    ad_platform: adPlatform,
    ...criticalData,
  }
}

async function checkSEO(base, html) {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const metaTitle  = titleMatch ? titleMatch[1].trim() : ''
  const hasMetaTitle = metaTitle.length > 5
  let titleQuality = 'Missing', titleScore = 0
  if (metaTitle) {
    const len = metaTitle.length
    const tl  = metaTitle.toLowerCase()
    if (len < 20) { titleQuality = 'Too short'; titleScore = 10 }
    else if (len > 70) { titleQuality = 'Too long'; titleScore = 15 }
    else if (tl.includes('home') || tl === 'shopify store' || tl.includes('my store')) { titleQuality = 'Generic — no keywords'; titleScore = 10 }
    else { titleQuality = 'Good ✓'; titleScore = 30 }
  }
  const metaDesc = extractMeta(html, 'description')
  const hasMetaDescription = metaDesc.length > 10
  let descQuality = 'Missing', descScore = 0
  if (metaDesc) {
    const dl = metaDesc.length
    if (dl < 50) { descQuality = 'Too short'; descScore = 8 }
    else if (dl > 160) { descQuality = 'Too long'; descScore = 10 }
    else { descQuality = 'Good ✓'; descScore = 20 }
  }
  const imgTags     = html.match(/<img[^>]+>/gi) || []
  const totalImgs   = imgTags.length
  const imgsWithAlt = imgTags.filter(t => /alt=["'][^"']{3,}["']/i.test(t)).length
  const altPct      = totalImgs > 0 ? Math.round((imgsWithAlt/totalImgs)*100) : 0
  const hasAltText  = altPct > 30
  const sitemapR    = await safeFetch(base + '/sitemap.xml')
  const hasSitemap  = sitemapR?.ok || false
  const robotsR     = await safeFetch(base + '/robots.txt')
  const hasRobots   = robotsR?.ok || false
  const hasBlog     = hasPattern(html, ['/blogs/', '/blog', '/articles/'])
  const hasOgTags   = html.includes('og:title')
  const hasH1       = /<h1[^>]*>[^<]{3,}<\/h1>/i.test(html)
  const hasH2       = /<h2[^>]*>[^<]{3,}<\/h2>/i.test(html)
  const seoScore    = Math.min(100, titleScore + descScore + Math.round(altPct*0.15) + (hasSitemap?15:0) + (hasRobots?5:0) + (hasBlog?10:0) + (hasOgTags?10:0) + (hasH1?5:0) + (hasH2?3:0))
  let googleTier = 'Page 5+ (nearly invisible)'
  if (seoScore >= 75) googleTier = 'Page 1-2 (good visibility)'
  else if (seoScore >= 55) googleTier = 'Page 2-3 (some visibility)'
  else if (seoScore >= 35) googleTier = 'Page 3-5 (low visibility)'
  return { seo_score: seoScore, has_meta_title: hasMetaTitle, meta_title_value: metaTitle.slice(0,60)||'Not found', title_quality: titleQuality, has_meta_description: hasMetaDescription, desc_quality: descQuality, has_alt_text: hasAltText, alt_text_pct: altPct+'%', has_sitemap: hasSitemap, has_robots: hasRobots, has_blog: hasBlog, has_og_tags: hasOgTags, has_h1: hasH1, has_h2: hasH2, google_tier: googleTier }
}

async function checkProducts(base) {
  try {
    const r = await safeFetch(base + '/products.json?limit=50')
    if (!r || !r.ok) return null
    const d = await r.json()
    const products = d.products || []
    if (!products.length) return null
    const prices = []
    let totalDescLen = 0, totalImages = 0
    for (const p of products) {
      for (const v of (p.variants||[])) { const pr = parseFloat(v.price); if (pr>0) prices.push(pr) }
      totalDescLen += (p.body_html||'').replace(/<[^>]*>/g,'').length
      totalImages  += (p.images||[]).length
    }
    const avgDesc = Math.round(totalDescLen/products.length)
    const avgImgs = parseFloat((totalImages/products.length).toFixed(1))
    const mn = prices.length ? Math.min(...prices) : 0
    const mx = prices.length ? Math.max(...prices) : 0
    const priceRange = prices.length ? (mn===mx?`$${mn.toFixed(0)}`:`$${mn.toFixed(0)} – $${mx.toFixed(0)}`) : 'Unknown'
    let descQuality = 'Very short'
    if (avgDesc > 300) descQuality = 'Detailed ✓'
    else if (avgDesc > 100) descQuality = 'Moderate'
    else if (avgDesc > 30) descQuality = 'Short — improve'
    let score = 15
    if (products.length >= 20) score += 30
    else if (products.length >= 10) score += 20
    else if (products.length >= 5) score += 10
    if (avgDesc > 200) score += 30
    else if (avgDesc > 80) score += 15
    if (avgImgs >= 3) score += 25
    else if (avgImgs >= 2) score += 15
    else if (avgImgs >= 1) score += 5
    const best = products.sort((a,b)=>{ const pa=parseFloat(a.variants?.[0]?.price||0),pb=parseFloat(b.variants?.[0]?.price||0); return (pb+(b.images||[]).length*5)-(pa+(a.images||[]).length*5) })[0]?.title||''
    return { products_score: Math.min(score,100), product_count: products.length, avg_desc_length: descQuality, avg_images: avgImgs, price_range: priceRange, best_ad_product: best }
  } catch { return null }
}

async function checkTrust(base, html) {
  const hasReviews = hasPattern(html, ['judge.me','yotpo','stamped','okendo','loox','reviews','star-rating'])
  const returnR = await safeFetch(base + '/policies/refund-policy')
  const hasReturnPolicy = returnR?.ok || hasPattern(html, ['return policy','refund policy'])
  const contactR = await safeFetch(base + '/pages/contact')
  const hasContact = contactR?.ok || hasPattern(html, ['/pages/contact'])
  const aboutR = await safeFetch(base + '/pages/about')
  const hasAbout = aboutR?.ok || hasPattern(html, ['/pages/about'])
  const hasSocial = ['instagram.com','facebook.com','tiktok.com','twitter.com'].some(s=>html.includes(s))
  const hasEmail = !!html.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)
  const hasSSL = base.startsWith('https://')
  let score = 0
  if (hasReviews) score += 25
  if (hasReturnPolicy) score += 20
  if (hasContact) score += 15
  if (hasAbout) score += 15
  if (hasSocial) score += 10
  if (hasEmail) score += 10
  if (hasSSL) score += 5
  return { trust_score: Math.min(score,100), has_reviews: hasReviews, has_return_policy: hasReturnPolicy, has_contact: hasContact, has_about: hasAbout, has_social: hasSocial, has_email: hasEmail, has_ssl: hasSSL }
}

function getAdPlatform(niche) {
  const map = { 'Fashion & Clothing':'TikTok + Instagram', 'Jewelry & Accessories':'Instagram + Pinterest', 'Beauty & Skincare':'TikTok + Instagram', 'Home & Decor':'Pinterest + Instagram', 'Digital Products':'Facebook + Google', 'Pet Products':'Facebook + TikTok', 'Food & Drink':'Instagram + TikTok', 'Fitness & Health':'Instagram + YouTube' }
  return map[niche] || 'Facebook + Instagram'
}

function checkAdReadiness({ trust, products, speed, niche, adPlatform }) {
  const blockers = []
  if (!trust.has_return_policy) blockers.push('no return policy')
  if (!trust.has_reviews) blockers.push('no customer reviews')
  if (products && products.product_count < 5) blockers.push('too few products')
  if (speed && speed.perf < 30) blockers.push('store too slow')
  const shouldRunAds = blockers.length === 0
  let adReason = shouldRunAds
    ? `Your store has the basics in place. Start with $5-10/day on ${adPlatform} targeting ${niche.split('/')[0].trim().toLowerCase()} buyers.`
    : `Fix these first: ${blockers.join(', ')}. Running ads now will waste money.`
  return { ads_score: shouldRunAds?80:30, should_run_ads: shouldRunAds, ad_reason: adReason, ad_roi_estimate: shouldRunAds?'Medium-High':'Low — fix issues first' }
}

function buildCriticals(d) {
  const c=[], f=[]
  if (!d.has_meta_description) { c.push('No meta description — Google cannot properly index your store.'); f.push('Add a meta description to every page (60-160 characters)') }
  if (!d.has_reviews) { c.push('No customer reviews — 93% of buyers read reviews before purchasing.'); f.push('Install Judge.me (free) and collect your first 5 reviews') }
  if (d.product_count < 5) { c.push(`Only ${d.product_count} product(s) — near-empty stores look abandoned.`); f.push('Add at least 10-15 products with detailed descriptions') }
  if (!d.has_return_policy) { c.push('No return policy — major trust blocker for first-time buyers.'); f.push('Add a clear return/refund policy page') }
  if (d.pagespeed_score < 40) { c.push(`Page speed ${d.pagespeed_score}/100 — store loads too slowly, visitors leave.`); f.push('Compress product images and remove unused apps') }
  if (!d.has_social) { c.push('No social media links — no way for new customers to discover you.'); f.push('Create Instagram and TikTok and link them from your store') }
  if (d.avg_images < 2 && d.product_count > 0) { c.push('Low product image count — buyers need multiple angles before buying.'); f.push('Add 3-4 high quality photos per product') }
  return { critical_issues: c.slice(0,4), top_fixes: f.slice(0,5) }
}
