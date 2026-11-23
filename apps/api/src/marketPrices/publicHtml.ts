import { ProviderError, type FetchLike } from './common.js';

/** Public pages only. No cookies, credentials, proxies, remote jobs or extra service. */
export async function fetchPublicHtml(fetcher: FetchLike, url: string, timeoutMs = 8000) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'Cartelites/1.0 market-research' },
      credentials: 'omit', redirect: 'error', signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) throw new ProviderError('access');
    if (response.status === 429) throw new ProviderError('rate_limit');
    if (!response.ok) throw new ProviderError('unavailable');
    const reader = response.body?.getReader();
    if (!reader) throw new ProviderError('schema');
    let size = 0, html = '';
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8_000_000) { await reader.cancel(); throw new ProviderError('schema'); }
      html += decoder.decode(value, { stream: true });
    }
    html += decoder.decode();
    if (/<title[^>]*>\s*(Just a moment|Attention Required|Access Denied|Error Page \| eBay)/i.test(html) ||
        /captcha-delivery\.com|id=["']challenge-form["']/i.test(html)) throw new ProviderError('access');
    return html;
  } catch (error) {
    if (controller.signal.aborted) throw new ProviderError('timeout');
    if (error instanceof ProviderError) throw error;
    throw new ProviderError('unavailable');
  } finally { clearTimeout(timer); }
}
