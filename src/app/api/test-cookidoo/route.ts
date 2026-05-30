import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const TEST_URL = 'https://cookidoo.fr/recipes/recipe/fr-FR/r570498'

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function GET() {
  const result: Record<string, unknown> = { url: TEST_URL }

  try {
    const res = await fetch(TEST_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      },
    })

    result.status = res.status
    result.content_type = res.headers.get('content-type')

    const raw = await res.text()
    result.raw_size_bytes = raw.length

    // Check for ingredient-related keywords in the raw HTML
    const ingredientKeywords = ['ingrédient', 'ingredient', 'Kefta', 'yaourt', 'agneau', 'oignon']
    result.keywords_found = ingredientKeywords.filter((kw) =>
      raw.toLowerCase().includes(kw.toLowerCase())
    )

    // Check if it looks like a JS-only shell (no meaningful body content)
    result.has_noscript_tag = raw.includes('<noscript')
    result.has_app_root = raw.includes('id="app"') || raw.includes('id="root"') || raw.includes('id="__next"')
    result.looks_like_js_shell = raw.length < 5000 || (result.keywords_found as string[]).length === 0

    // Return first 3000 chars of stripped text so we can see what's there
    const stripped = stripHtml(raw)
    result.stripped_preview = stripped.slice(0, 3000)

    // Also return first 2000 chars of raw HTML for structure inspection
    result.raw_html_preview = raw.slice(0, 2000)

  } catch (e) {
    result.fetch_error = e instanceof Error ? e.message : String(e)
  }

  return NextResponse.json(result, { status: 200 })
}
