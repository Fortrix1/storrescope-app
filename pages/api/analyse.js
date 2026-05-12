// pages/api/analyse.js
// Full store analysis engine
// Visits the store and checks 47+ signals

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'No URL provided' })

  try {
    const result = await analyseStore(url)
    res.status(200).json(result)
  } catch(e) {
    res.status(500).json({ error: e.message })
  }
}

// ── HELPERS ──────────────────────────────────────────

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

async function safeFetch(url, opts={}) {
  try {
    const r = await fetch(url, {
      headers: HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      ...opts
    })
    return r
  } catch {
    return null
  }
}

async function safeText(url) {
  const r = await safeFetch(url)
  if (!r || !r.ok) return ''
  return await r.text().catch(() => '')
}

function extractMeta(html, name) {
  const patterns = [
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`,'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`,'i'),
    new RegExp(`<meta[^>]+property=["']og:${name}["'][^>]+content=["']([^"']+)["']`,'i'),
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

function detectPlatform(html, url) {
  if (html.includes('Shopify.shop') || html.includes('myshopify.com') || html.includes('cdn.shopify.com')) return 'Shopify'
  if (html.includes('wix.com') || html.includes('wixsite.com') || html.includes('wix-code')) return 'Wix'
  if (html.includes('wp-content') || html.includes('wp-includes') || html.includes('wordpress')) return 'WordPress'
  if (html.includes('squarespace.com') || html.includes('static1.squarespace')) return 'Squarespace'
  if (html.includes('bigcommerce') || html.includes('bc-storefront')) return 'BigCommerce'
  if (html.includes('webflow')) return 'Webflow'
  if (html.includes('weebly')) return 'Weebly'
  if (html.includes('prestashop')) return 'PrestaShop'
  return 'Custom/Other'
}

function detectNiche(html, products) {
  const combined = (html + ' ' + products.map(p => `${p.title} ${p.type} ${(p.tags||[]).join(' ')}`).join(' ')).toLowerCase()
  const niches = [
    ['Fashion & Clothing',  ['shirt','dress','hoodie','clothing','fashion','wear','jacket','tee','apparel','outfit']],
    ['Jewelry & Accessories',['jewelry','necklace','ring','bracelet','earring','watch','accessory']],
    ['Beauty & Skincare',   ['skin','beauty','serum','cream','lotion','glow','hair','makeup','cosmetic']],
    ['Home & Decor',        ['home','decor','candle','wall art','pillow','print','mug','furniture']],
    ['Digital Products',    ['digital','ebook','template','course','printable','download']],
    ['Pet Products',        ['pet','dog','cat','animal','paw']],
    ['Food & Drink',        ['food','drink','tea','coffee','snack','sauce','spice','nutrition']],
    ['Fitness & Health',    ['fitness','gym','workout','health','sport','yoga','supplement','protein']],
    ['Baby & Kids',         ['baby','kid','child','toy','nursery','toddler']],
    ['Art & Crafts',        ['art','craft','handmade','custom','personaliz','engrav','paint']],
    ['Tech & Electronics',  ['tech','electronic','gadget','phone','cable','charger','accessory']],
  ]
  for (const [name, kws] of niches) {
    if (kws.some(k => combined.includes(k))) return name
  }
  return 'General / Mixed'
}

function adPlatformForNiche(niche) {
  const map = {
    'Fashion & Clothing':    'TikTok + Instagram',
    'Jewelry & Accessories': 'Instagram + Pinterest',
    'Beauty & Skincare':     'TikTok + Instagram',
    'Home & Decor':          'Pinterest + Instagram',
    'Digital Products':      'Facebook + Google',
    'Pet Products':          'Facebook + TikTok',
    'Food & Drink':          'Instagram + TikTok',
    'Fitness & Health':      'Instagram + YouTube',
    'Baby & Kids':           'Facebook + Pinterest',
    'Art & Crafts':          'Etsy + Instagram',
    'Tech & Electronics':    'Google + YouTube',
  }
  return map[niche] || 'Facebook + Instagram'
}

// ── GOOGLE PAGESPEED API ──────────────────────────────

async function getPageSpeed(url) {
  try {
    // Google PageSpeed Insights API — free, no key needed for basic
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile`
    const r = await fetch(apiUrl, { signal: AbortSignal.timeout(15000) })
    if (!r.ok) return null
    const d = await r.json()
    const cats = d.lighthouseResult?.categories
    const perf  = Math.round((cats?.performance?.score || 0) * 100)
    const mobile = Math.round((cats?.performance?.score || 0) * 100)

    // Load speed from metrics
    const metrics = d.lighthouseResult?.audits
    const fcp = metrics?.['first-contentful-paint']?.numericValue || 0
    const loadSpeed = parseFloat((fcp / 1000).toFixed(1))

    return { perf, mobile, loadSpeed }
  } catch {
    return null
  }
}

// ── SEO CHECKS ────────────────────────────────────────

async function checkSEO(url, html) {
  const base = url.replace(/\/$/, '')

  const hasMetaTitle       = !!extractMeta(html, 'title') || /<title[^>]*>[^<]{5,}<\/title>/i.test(html)
  const hasMetaDescription = !!extractMeta(html, 'description')
  const hasAltText         = /alt=["'][^"']{3,}["']/i.test(html)

  // Check sitemap
  const sitemapR = await safeFetch(base + '/sitemap.xml')
  const hasSitemap = sitemapR?.ok || false

  // Check robots.txt
  const robotsR = await safeFetch(base + '/robots.txt')
  const hasRobots = robotsR?.ok || false

  // Count pages via site: search simulation
  // We check how many internal links are in the HTML as a proxy
  const internalLinks = (html.match(/href=["']\/[^"']{1,}/g) || []).length
  const pagesIndexed  = Math.max(1, Math.floor(internalLinks * 0.4))

  // Blog
  const hasBlog = hasPattern(html, ['/blogs/', '/blog', '/articles/', '/news'])

  // Estimate Google tier based on signals
  let seoScore = 0
  if (hasMetaTitle)       seoScore += 20
  if (hasMetaDescription) seoScore += 20
  if (hasAltText)         seoScore += 15
  if (hasSitemap)         seoScore += 20
  if (hasRobots)          seoScore += 10
  if (hasBlog)            seoScore += 15

  let googleTier = 'Page 5+'
  if (seoScore >= 80) googleTier = 'Page 1-2'
  else if (seoScore >= 60) googleTier = 'Page 2-3'
  else if (seoScore >= 40) googleTier = 'Page 3-4'
  else if (seoScore >= 20) googleTier = 'Page 4-5'

  return {
    seo_score:            seoScore,
    has_meta_title:       hasMetaTitle,
    has_meta_description: hasMetaDescription,
    has_alt_text:         hasAltText,
    has_sitemap:          hasSitemap,
    has_robots:           hasRobots,
    has_blog:             hasBlog,
    pages_indexed:        pagesIndexed,
    google_tier:          googleTier,
  }
}

// ── PRODUCT CHECKS ────────────────────────────────────

async function checkProducts(baseUrl) {
  try {
    const r = await safeFetch(baseUrl + '/products.json?limit=50')
    if (!r || !r.ok) return null
    const d = await r.json()
    const products = d.products || []
    if (!products.length) return null

    const prices = []
    let totalDescLen = 0
    let totalImages  = 0

    for (const p of products) {
      for (const v of (p.variants || [])) {
        const price = parseFloat(v.price)
        if (price > 0) prices.push(price)
      }
      const desc = p.body_html || ''
      totalDescLen += desc.replace(/<[^>]*>/g,'').length
      totalImages  += (p.images || []).length
    }

    const avgDescLen = Math.round(totalDescLen / products.length)
    const avgImages  = parseFloat((totalImages / products.length).toFixed(1))
    const minPrice   = prices.length ? Math.min(...prices) : 0
    const maxPrice   = prices.length ? Math.max(...prices) : 0
    const priceRange = prices.length
      ? (minPrice === maxPrice ? `$${minPrice.toFixed(0)}` : `$${minPrice.toFixed(0)} – $${maxPrice.toFixed(0)}`)
      : 'Unknown'

    // Desc quality
    let descQuality = 'Very short — adds no value'
    if (avgDescLen > 300) descQuality = 'Detailed ✓'
    else if (avgDescLen > 100) descQuality = 'Moderate — could be better'
    else if (avgDescLen > 30) descQuality = 'Short — needs improvement'

    // Score
    let score = 0
    if (products.length >= 20) score += 30
    else if (products.length >= 10) score += 20
    else if (products.length >= 5) score += 10
    if (avgDescLen > 200) score += 30
    else if (avgDescLen > 80) score += 15
    if (avgImages >= 3) score += 25
    else if (avgImages >= 2) score += 15
    else if (avgImages >= 1) score += 5
    score += 15  // base

    // Best product for ads (highest price with most images)
    const bestAdProduct = products
      .sort((a,b) => {
        const priceA = parseFloat(a.variants?.[0]?.price || 0)
        const priceB = parseFloat(b.variants?.[0]?.price || 0)
        const imgA   = (a.images||[]).length
        const imgB   = (b.images||[]).length
        return (priceB + imgB*5) - (priceA + imgA*5)
      })[0]?.title || ''

    return {
      products_score:    Math.min(score, 100),
      product_count:     products.length,
      avg_desc_length:   descQuality,
      avg_images:        avgImages,
      price_range:       priceRange,
      best_ad_product:   bestAdProduct,
      raw_products:      products,
      avg_price:         prices.length ? (prices.reduce((a,b)=>a+b,0)/prices.length) : 0,
    }
  } catch {
    return null
  }
}

// ── TRUST CHECKS ─────────────────────────────────────

async function checkTrust(baseUrl, html) {
  const base = baseUrl.replace(/\/$/, '')

  // Reviews
  const hasReviews = hasPattern(html, [
    'judge.me', 'yotpo', 'stamped', 'okendo', 'loox',
    'reviews', 'star-rating', 'review-count', 'rating--'
  ])

  // Return policy
  const returnR = await safeFetch(base + '/policies/refund-policy')
    || await safeFetch(base + '/pages/return-policy')
    || await safeFetch(base + '/pages/returns')
  const hasReturnPolicy = returnR?.ok || hasPattern(html, ['return policy','refund policy','refund-policy'])

  // Contact
  const contactR = await safeFetch(base + '/pages/contact')
    || await safeFetch(base + '/pages/contact-us')
  const hasContact = contactR?.ok || hasPattern(html, ['/pages/contact','/contact'])

  // About
  const aboutR = await safeFetch(base + '/pages/about')
    || await safeFetch(base + '/pages/about-us')
  const hasAbout = aboutR?.ok || hasPattern(html, ['/pages/about','/about-us'])

  // Social
  const socials = ['instagram.com','facebook.com','tiktok.com','twitter.com','pinterest.com','youtube.com']
  const hasSocial = socials.some(s => html.includes(s))

  // Email
  const emailMatch = html.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/)
  const hasEmail = !!emailMatch

  // SSL (if we got here with https it has SSL)
  const hasSSL = baseUrl.startsWith('https://')

  let score = 0
  if (hasReviews)      score += 25
  if (hasReturnPolicy) score += 20
  if (hasContact)      score += 15
  if (hasAbout)        score += 15
  if (hasSocial)       score += 10
  if (hasEmail)        score += 10
  if (hasSSL)          score += 5

  return {
    trust_score:       Math.min(score, 100),
    has_reviews:       hasReviews,
    has_return_policy: hasReturnPolicy,
    has_contact:       hasContact,
    has_about:         hasAbout,
    has_social:        hasSocial,
    has_email:         hasEmail,
    has_ssl:           hasSSL,
  }
}

// ── AD READINESS ──────────────────────────────────────

function checkAdReadiness(data) {
  const { trust, products, seo, speed } = data

  // Don't recommend ads if fundamentals are broken
  const blockers = []
  if (!trust.has_return_policy) blockers.push('no return policy')
  if (!trust.has_reviews)       blockers.push('no customer reviews')
  if (products && products.product_count < 5) blockers.push('too few products')
  if (speed && speed.perf < 30) blockers.push('store too slow')

  const shouldRunAds = blockers.length === 0
  const adScore      = shouldRunAds ? 80 : 30

  let adReason = ''
  let adROI    = 'Low — fix issues first'

  if (shouldRunAds) {
    adROI    = 'Medium-High — store is ready'
    adReason = `Your store has the basics in place to run ads profitably. Focus on ${data.niche} audiences. Start with a small budget ($5-10/day) on ${data.ad_platform} targeting people interested in ${data.niche.split('/')[0].trim().toLowerCase()}.`
    if (products?.best_ad_product) {
      adReason += ` Run your first ad on "${products.best_ad_product}" — it has the best combination of price and presentation.`
    }
  } else {
    adReason = `Fix these first before spending on ads: ${blockers.join(', ')}. Running ads now will waste money — buyers will click through and leave without buying because these issues break trust.`
  }

  return {
    ads_score:        adScore,
    should_run_ads:   shouldRunAds,
    ad_reason:        adReason,
    ad_roi_estimate:  adROI,
  }
}

// ── CRITICAL ISSUES + TOP FIXES ──────────────────────

function buildCriticals(d) {
  const criticals = []
  const fixes     = []

  if (!d.has_meta_description) {
    criticals.push('No meta description — Google cannot properly index your store. You are invisible to most searches.')
    fixes.push('Add a meta description to every page (60-160 characters describing what you sell)')
  }
  if (!d.has_reviews) {
    criticals.push('No customer reviews — 93% of buyers read reviews before purchasing. Without them, trust is near zero.')
    fixes.push('Install a review app (Judge.me is free) and collect your first 5 reviews immediately')
  }
  if (d.product_count < 5) {
    criticals.push(`Only ${d.product_count} product(s) — buyers need choice. A near-empty store looks abandoned.`)
    fixes.push('Add at least 10-15 products with detailed descriptions and multiple photos each')
  }
  if (!d.has_return_policy) {
    criticals.push('No return policy — this is a major trust blocker. Most buyers check for this before buying.')
    fixes.push('Add a clear return/refund policy page — even a simple 30-day return policy works')
  }
  if (d.pagespeed_score < 40) {
    criticals.push(`Page speed score of ${d.pagespeed_score}/100 — your store loads too slowly. Visitors leave after 3 seconds.`)
    fixes.push('Compress all product images and remove unused apps to improve load speed')
  }
  if (!d.has_meta_title) {
    criticals.push('Missing or weak page title — search engines don\'t know what your store sells.')
    fixes.push('Set a clear page title that includes your main product category and store name')
  }
  if (!d.has_social) {
    criticals.push('No social media links — you have no way for new customers to discover you organically.')
    fixes.push('Create Instagram and TikTok accounts for your store and link them from your website')
  }
  if (d.avg_images < 2 && d.product_count > 0) {
    criticals.push('Low product image count — buyers need to see products from multiple angles before buying.')
    fixes.push('Add at least 3-4 high quality photos per product showing different angles and use cases')
  }
  if (d.redesign_needed) {
    criticals.push('Design issues detected — your store\'s visual experience may be hurting conversions.')
    fixes.push('Consider a clean minimal theme that loads fast and looks professional on mobile')
  }

  return {
    critical_issues: criticals.slice(0, 4),
    top_fixes:       fixes.slice(0, 5),
  }
}

// ── MAIN ANALYSIS ─────────────────────────────────────

async function analyseStore(url) {
  const base = url.replace(/\/$/, '')

  // 1. Fetch homepage
  const homeR = await safeFetch(base)
  if (!homeR || !homeR.ok) throw new Error('Could not reach store')
  const html = await homeR.text()

  // 2. Run all checks in parallel
  const [speedData, seoData, productData, trustData, psData] = await Promise.all([
    Promise.resolve(null),     // speed handled by pagespeed
    checkSEO(base, html),
    checkProducts(base),
    checkTrust(base, html),
    getPageSpeed(base),
  ])

  // 3. Platform detection
  const platform       = detectPlatform(html, base)
  const niche          = detectNiche(html, productData?.raw_products || [])
  const adPlatform     = adPlatformForNiche(niche)

  // 4. Speed score
  const pagespeedScore = psData?.perf   || 0
  const mobileScore    = psData?.mobile || 0
  const loadSpeed      = psData?.loadSpeed || 0
  const speedScore     = pagespeedScore

  // 5. Redesign check
  const redesignNeeded = (pagespeedScore < 40 || mobileScore < 40)

  // 6. New seller check
  const productCount  = productData?.product_count || 0
  const reviewCount   = trustData.has_reviews ? 1 : 0
  const isNewSeller   = productCount < 10 && !trustData.has_reviews

  // 7. Ad readiness
  const adData = checkAdReadiness({
    trust:      trustData,
    products:   productData,
    seo:        seoData,
    speed:      {perf: pagespeedScore},
    niche,
    ad_platform: adPlatform,
  })

  // 8. Store name
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const storeName  = titleMatch
    ? titleMatch[1].split('–')[0].split('|')[0].trim().slice(0, 50)
    : base.replace(/https?:\/\//,'').split('.')[0]

  // 9. Overall score
  const scores = [
    speedScore,
    seoData.seo_score,
    productData?.products_score || 20,
    trustData.trust_score,
  ]
  const overallScore = Math.round(scores.reduce((a,b)=>a+b,0) / scores.length)

  // 10. Build criticals
  const criticalData = buildCriticals({
    has_meta_description: seoData.has_meta_description,
    has_meta_title:       seoData.has_meta_title,
    has_reviews:          trustData.has_reviews,
    has_return_policy:    trustData.has_return_policy,
    has_social:           trustData.has_social,
    pagespeed_score:      pagespeedScore,
    product_count:        productCount,
    avg_images:           productData?.avg_images || 0,
    redesign_needed:      redesignNeeded,
  })

  return {
    // Meta
    store_name:      storeName,
    platform,
    niche,
    is_new_seller:   isNewSeller,
    overall_score:   overallScore,

    // Speed
    speed_score:     speedScore,
    pagespeed_score: pagespeedScore,
    mobile_score:    mobileScore,
    load_speed:      loadSpeed ? loadSpeed + 's' : 'Unknown',
    has_ssl:         trustData.has_ssl,
    redesign_needed: redesignNeeded,

    // SEO
    ...seoData,

    // Products
    products_score:  productData?.products_score || 20,
    product_count:   productCount,
    avg_desc_length: productData?.avg_desc_length || 'Unknown',
    avg_images:      productData?.avg_images || 0,
    price_range:     productData?.price_range || 'Unknown',
    best_ad_product: productData?.best_ad_product || '',

    // Trust
    ...trustData,

    // Ads
    ...adData,
    ad_platform:     adPlatform,

    // Criticals
    ...criticalData,
  }
}
