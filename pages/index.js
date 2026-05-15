import { useEffect } from 'react'

export default function Home() {
  useEffect(() => {
    // Load the full HTML page
    fetch('/index.html')
      .then(r => r.text())
      .then(html => {
        document.open()
        document.write(html)
        document.close()
      })
  }, [])
  return null
}
