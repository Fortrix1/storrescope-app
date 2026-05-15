export default function Home() {
  return null
}

export async function getServerSideProps({ res }) {
  const fs   = require('fs')
  const path = require('path')
  const html = fs.readFileSync(
    path.join(process.cwd(), 'public', 'index.html'), 'utf-8'
  )
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.write(html)
  res.end()
  return { props: {} }
}
