import { FaFacebook, FaInstagram } from 'react-icons/fa';

export function SocialLinks() {
  return (
    <span className="social-links" role="group" aria-label="Retrouvez Cartélites sur les réseaux sociaux">
      <a href="https://www.instagram.com/cartelites/" target="_blank" rel="noopener noreferrer" aria-label="Instagram Cartélites (nouvel onglet)">
        <FaInstagram aria-hidden="true" />
        <span>Instagram</span>
      </a>
      <a href="https://www.facebook.com/profile.php?id=61596948501271" target="_blank" rel="noopener noreferrer" aria-label="Facebook Cartélites (nouvel onglet)">
        <FaFacebook aria-hidden="true" />
        <span>Facebook</span>
      </a>
    </span>
  );
}
