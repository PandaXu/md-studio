import type { Connect } from 'vite'
import { URL as NodeURL } from 'node:url'
import { MD_FETCH_PATH } from '../src/constants/mdFetchApi'

const MAX_BODY_BYTES = 2 * 1024 * 1024
const TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 3

function sendJson(res: Connect.ServerResponse, status: number, error: string) {
  const body = JSON.stringify({ error })
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', Buffer.byteLength(body))
  res.end(body)
}

function sendText(res: Connect.ServerResponse, status: number, body: string) {
  res.statusCode = status
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.end(body)
}

function isClearlyNonText(contentType: string | null): boolean {
  if (!contentType) return false
  const main = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  if (main.startsWith('text/')) return false
  if (
    main === 'application/json' ||
    main === 'application/javascript' ||
    main === 'application/xml' ||
    main === 'application/xhtml+xml' ||
    main === 'application/octet-stream'
  ) {
    return false
  }
  if (
    main.startsWith('image/') ||
    main.startsWith('video/') ||
    main.startsWith('audio/') ||
    main.startsWith('font/') ||
    main === 'application/pdf' ||
    main.startsWith('multipart/')
  ) {
    return true
  }
  return true
}

async function readBodyWithLimit(res: globalThis.Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) {
    const buf = await res.arrayBuffer()
    if (buf.byteLength > maxBytes) throw new Error(`响应超过 ${maxBytes} 字节`)
    return new TextDecoder('utf-8', { fatal: false }).decode(buf)
  }
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new Error(`响应超过 ${maxBytes} 字节`)
    }
    chunks.push(value)
  }
  const merged = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    merged.set(c, off)
    off += c.byteLength
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged)
}

async function fetchWithRedirectLimit(
  startUrl: string,
  signal: AbortSignal,
): Promise<globalThis.Response> {
  let current = startUrl
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(current, { method: 'GET', redirect: 'manual', signal })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) {
        return res
      }
      if (hop === MAX_REDIRECTS) {
        throw new Error(`重定向超过 ${MAX_REDIRECTS} 次`)
      }
      current = new NodeURL(loc, current).href
      continue
    }
    return res
  }
  throw new Error(`重定向超过 ${MAX_REDIRECTS} 次`)
}

function parseTargetUrl(raw: string | undefined): URL {
  if (!raw) throw new Error('缺少 url 参数')
  const target = new URL(raw)
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new Error('仅支持 http 或 https URL')
  }
  return target
}

export function mdFetchDevMiddleware(): Connect.NextHandleFunction {
  return async (req, res, next) => {
    if (req.method !== 'GET') return next()
    const reqUrl = req.url
    if (!reqUrl || !reqUrl.startsWith(MD_FETCH_PATH)) return next()
    if (reqUrl === MD_FETCH_PATH) {
      sendJson(res, 400, '缺少 url 查询参数')
      return
    }
    if (!reqUrl.startsWith(`${MD_FETCH_PATH}?`)) return next()

    const qIdx = reqUrl.indexOf('?')
    const qsRaw = qIdx >= 0 ? reqUrl.slice(qIdx + 1) : ''
    let targetAbsolute: URL
    try {
      const qs = new URLSearchParams(qsRaw)
      const encoded = qs.get('url')
      if (!encoded) throw new Error('缺少 url 查询参数')
      targetAbsolute = parseTargetUrl(encoded)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      sendJson(res, 400, msg)
      return
    }

    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
    try {
      const upstream = await fetchWithRedirectLimit(targetAbsolute.href, ac.signal)
      if (!upstream.ok) {
        sendJson(res, 502, `远端返回 ${upstream.status} ${upstream.statusText}`)
        return
      }
      const ct = upstream.headers.get('content-type')
      if (isClearlyNonText(ct)) {
        sendJson(res, 415, 'Content-Type 非文本，已拒绝载入')
        return
      }
      const text = await readBodyWithLimit(upstream, MAX_BODY_BYTES)
      sendText(res, 200, text)
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError'
      sendJson(
        res,
        aborted ? 504 : 502,
        aborted ? `请求超时（${TIMEOUT_MS}ms）` : e instanceof Error ? e.message : String(e),
      )
    } finally {
      clearTimeout(timer)
    }
  }
}
