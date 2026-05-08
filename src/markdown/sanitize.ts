import DOMPurify from 'dompurify'
import type { Config } from 'dompurify'

const CONFIG: Config = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'strong',
    'em',
    'del',
    's',
    'ul',
    'ol',
    'li',
    'blockquote',
    'code',
    'pre',
    'hr',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'a',
    'img',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'div',
    'span',
    'input',
    'details',
    'summary',
  ],
  ALLOWED_ATTR: [
    'href',
    'title',
    'src',
    'alt',
    'class',
    'id',
    'align',
    'colspan',
    'rowspan',
    'type',
    'checked',
    'disabled',
    'role',
  ],
  ALLOW_DATA_ATTR: true,
  // Allow base64 data URI images in markdown preview.
  ADD_DATA_URI_TAGS: ['img'],
  // Explicitly allow safe image data URIs, including SVG base64 payloads.
  ALLOWED_URI_REGEXP:
    /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$)|data:image\/(?:png|gif|jpe?g|webp|svg\+xml);base64,[a-z0-9+/=\s]+)$/i,
}

export function sanitizeMarkdownHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, CONFIG) as unknown as string
}
