import { FaFacebook, FaInstagram } from 'react-icons/fa';
import { FiExternalLink } from 'react-icons/fi';
import { publicShopConfig } from '../../../shop.config';

export function SocialLinks() {
  const { name, socialLinks } = publicShopConfig.branding;
  if (!socialLinks.length) return null;
  return (
    <span
      className="social-links"
      role="group"
      aria-label={`Retrouvez ${name} sur les réseaux sociaux`}
    >
      {socialLinks.map((link) => {
        const Icon =
          link.icon === 'instagram'
            ? FaInstagram
            : link.icon === 'facebook'
              ? FaFacebook
              : FiExternalLink;
        return (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${link.label} ${name} (nouvel onglet)`}
          >
            <Icon aria-hidden="true" />
            <span>{link.label}</span>
          </a>
        );
      })}
    </span>
  );
}
