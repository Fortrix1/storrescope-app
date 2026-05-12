# StoreScope — Free Store Analysis Tool

## Deploy to Vercel in 3 steps:

1. Push this folder to GitHub
2. Connect to vercel.com → Import Project
3. Deploy — goes live at storrescope.vercel.app

## Before deploying:
Edit `public/index.html` and update:
- Line with `https://wa.me/YOUR_NUMBER` → your WhatsApp number
- Line with `mailto:YOUR_EMAIL` → your email

## How it works:
- `public/index.html` — the full website (UI + client JS)
- `pages/api/analyse.js` — the analysis engine (runs on Vercel)
- Calls Google PageSpeed API (free, no key needed)
- Visits the store URL and scrapes 47+ signals
- Returns full analysis as JSON
