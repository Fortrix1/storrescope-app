import fs from 'fs'
import path from 'path'

export default function Home({ content }) {
  return <div dangerouslySetInnerHTML={{ __html: content }} />
}

export async function getStaticProps() {
  const raw = fs.readFileSync(
    path.join(process.cwd(), 'public', 'index.html'), 'utf-8'
  )
  const bodyMatch = raw.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  const styleMatch = raw.match(/<style>([\s\S]*?)<\/style>/gi)
  const styles = styleMatch ? styleMatch.join('') : ''
  const content = styles + (bodyMatch ? bodyMatch[1] : raw)
  return { props: { content } }
}
