export type ShopSocialLink = { label: string; url: string; icon?: 'instagram' | 'facebook' };

/** Public shop links must be usable navigation URLs, never executable schemes. */
export function resolveShopLinks(links: readonly ShopSocialLink[]): ShopSocialLink[] {
  return links.map((link) => {
    const url = new URL(link.url);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      !link.label.trim()
    )
      throw new Error('Invalid public shop link');
    if (link.icon && !['instagram', 'facebook'].includes(link.icon))
      throw new Error('Invalid shop link icon');
    return { label: link.label.trim(), url: url.href, ...(link.icon ? { icon: link.icon } : {}) };
  });
}
