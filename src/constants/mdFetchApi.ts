/** 与规格一致：同源路径 `/__md-studio/md-fetch?url=` */
export const MD_FETCH_PATH = '/__md-studio/md-fetch' as const

/** 开发：空串表示使用当前页面 origin 的相对路径。生产：来自 `VITE_MD_FETCH_BASE`，已去尾部 `/`。 */
export function defaultMdFetchBaseForEnv(isDev: boolean, viteMdFetchBase: string | undefined): string {
  if (isDev) return ''
  return (viteMdFetchBase ?? '').trim().replace(/\/+$/, '')
}

/** 生产是否允许「从 URL 载入」：非 dev 时基址非空才算配置好。 */
export function isUrlFetchEnabled(fetchBase: string, isDev: boolean): boolean {
  if (isDev) return true
  return fetchBase.length > 0
}

/** 构造浏览器请求的代理 URL（含 query `url`）。 */
export function buildMdFetchProxyUrl(fetchBase: string, targetAbsoluteUrl: string): string {
  const q = new URLSearchParams({ url: targetAbsoluteUrl }).toString()
  const pathWithQuery = `${MD_FETCH_PATH}?${q}`
  if (!fetchBase) return pathWithQuery
  return `${fetchBase.replace(/\/+$/, '')}${pathWithQuery}`
}
