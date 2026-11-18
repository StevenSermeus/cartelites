// Informations publiques propres à l’exploitant de cette instance.
// Les champs vides restent signalés : ne pas inventer de coordonnées.
export const legal = {
  reviewed: false, // Passer à true après vérification des textes et du déploiement réel.
  updatedAt: '', // Date de validation (ex. 2026-11-18).
  country: 'Belgique',
  companyName: 'WDEE', // Exploitant légal ; indépendant du nom commercial brand.name.
  legalForm: 'SRL',
  address: 'Rue lieutenant tasse 68B1, 6141 Forchies-la-Marche',
  registration: '1034.196.875', // BCE en Belgique, registre équivalent ailleurs.
  vatNumber: 'BE1034.196.875', // Numéro ou mention de non-assujettissement applicable.
  website: '', // Facultatif : omis du bordereau si vide.
  email: 'steven@wdee.dev',
  phone: '+32 492 92 50 95',
  hostName: 'Contabo',
  hostAddress: '',
  hostContact: '',
  privacyEmail: 'steven@wdee.dev',
  legalBases: '', // Finalité → base légale ; préciser les obligations et intérêts invoqués.
  retention: '', // Durées par catégorie, archives, sauvegardes et critères de suppression.
  processors: '', // Prestataires effectivement utilisés et pays de traitement.
  transfers: '', // Transferts hors EEE et garanties, ou absence vérifiée de transfert.
  cookieLifetime: '', // Durée réelle, à aligner avec JWT_TTL_SECONDS côté API.
  additionalDisclosures: '', // Mentions sectorielles, DPO, médiation, etc., si applicables.
  authorityName: 'Autorité de protection des données (Belgique)',
  authorityUrl: 'https://www.autoriteprotectiondonnees.be/citoyen/agir/introduire-une-plainte',
};

export const legalReady = legal.reviewed && [
  legal.updatedAt, legal.country, legal.companyName, legal.legalForm, legal.address,
  legal.registration, legal.vatNumber, legal.email, legal.phone, legal.hostName,
  legal.hostAddress, legal.hostContact, legal.privacyEmail, legal.legalBases,
  legal.retention, legal.processors, legal.transfers, legal.cookieLifetime,
].every((value) => value.trim().length > 0);
