import fs from 'fs'
import path from 'path'

export default function Home({ content }) {
  return <div dangerouslySetInnerHTML={{ __html: content }} />
}

export async function getStaticProps() {
  const filePath = path.join(process.cwd(), 'public', 'index.html')
  const raw = fs.readFileSync(filePath, 'utf-8')
  // Extract everything inside <body>
  const bodyMatch = raw.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  // Extract <style> from <head>
  const styleMatch = raw.match(/<style>([\s\S]*?)<\/style>/gi)
  const styles = styleMatch ? styleMatch.join('') : ''
  const content = styles + (bodyMatch ? bodyMatch[1] : raw)
  return { props: { content } }
}
