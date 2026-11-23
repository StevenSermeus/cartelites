// Informations publiques propres à l’exploitant de cette instance.
// Les champs vides restent signalés : ne pas inventer de coordonnées.
export const legal = {
  reviewed: false, // Passer à true après vérification des textes et du déploiement réel.
  updatedAt: '23 novembre 2026', // Textes approuvés ; validation du déploiement encore en attente.
  country: 'Belgique',
  companyName: 'WDEE', // Exploitant légal ; indépendant du nom commercial brand.name.
  legalForm: 'SRL',
  address: '', // Adresse postale retirée à la demande de l’exploitant.
  registration: '1034.196.875', // BCE en Belgique, registre équivalent ailleurs.
  vatNumber: 'BE1034.196.875', // Numéro ou mention de non-assujettissement applicable.
  website: '', // Facultatif : omis du bordereau si vide.
  email: 'steven@wdee.dev',
  phone: '+32 492 92 50 95',
  hostName: 'Contabo GmbH',
  hostAddress: 'Welfenstraße 22, 81541 Munich, Allemagne',
  hostContact: 'https://contabo.com/en/legal/impressum/',
  storageProvider: 'Cloudflare R2 — stockage des documents PDF et des images en Europe.',
  databaseProvider: 'Convex — base de données hébergée en Europe.',
  privacyEmail: 'steven@wdee.dev',
  legalBases: [
    'Les données nécessaires aux achats, ventes et dépôts-ventes sont traitées pour préparer et exécuter ces contrats (article 6, paragraphe 1, point b du RGPD).',
    'La conservation des documents comptables et des justificatifs nécessaires répond aux obligations légales applicables (article 6, paragraphe 1, point c du RGPD).',
    'La gestion des accès internes, la sécurité du service et la prévention de la fraude reposent sur notre intérêt légitime à protéger notre activité et les données confiées (article 6, paragraphe 1, point f du RGPD), dans le respect des droits et libertés des personnes.',
  ].join('\n\n'),
  retention: [
    'Les documents comptables et les justificatifs nécessaires sont conservés pendant 10 ans, selon le point de départ légal applicable à chaque document. Pour les factures et documents TVA concernés, le délai court à partir du 1er janvier de l’année suivant leur émission.',
    'Les données des comptes internes sont conservées pendant leur utilisation. Après clôture, les données devenues inutiles sont destinées à être supprimées dans les 30 jours. Les éléments nécessaires aux obligations comptables ou à la preuve des opérations sont conservés séparément pour la durée applicable.',
    'Les photos sont conservées pendant la présence de l’article en stock. Après la vente ou la sortie du stock, seules celles nécessaires comme justificatif ou pour un litige sont conservées, pendant la durée correspondant à cette finalité.',
    'La durée retenue pour les journaux techniques est de 90 jours, sauf incident nécessitant une conservation prolongée et limitée aux éléments utiles à son traitement.',
    'Ces délais constituent la politique de conservation retenue. Leur mise en œuvre et les modalités de suppression des sauvegardes restent en cours de finalisation ; aucune purge automatique à ces échéances n’est actuellement garantie. Les demandes peuvent être adressées au contact relatif aux données personnelles.',
  ].join('\n\n'),
  processors: 'Contabo assure l’hébergement du site et de son API. Cloudflare R2 assure le stockage des documents PDF et des images en Europe. Convex héberge la base de données en Europe. Brevo assure l’envoi des e-mails transactionnels : réinitialisation du mot de passe, transmission des documents signés et des tickets de vente. Brevo reçoit les coordonnées du destinataire, le contenu du message et, le cas échéant, les pièces jointes nécessaires à cet envoi.',
  transfers: 'Les documents PDF et les images sont stockés sur Cloudflare R2 en Europe et la base de données sur Convex en Europe, selon la configuration déclarée par l’exploitant. Cette localisation ne signifie pas que tous les traitements des prestataires sont limités à l’Espace économique européen : certaines opérations de support, de sécurité ou de sous-traitance peuvent impliquer d’autres pays. Lorsqu’un transfert hors EEE a lieu, il doit être encadré par une décision d’adéquation applicable ou par les clauses contractuelles types de la Commission européenne, avec les mesures complémentaires nécessaires. Les garanties effectivement applicables dépendent du prestataire, du destinataire et du traitement ; leur vérification pour ce déploiement reste en cours. Vous pouvez demander des informations à ce sujet au contact relatif aux données personnelles.',
  cookieLifetime: 'Les cookies session et csrf expirent après une heure. Cette durée est renouvelée lors du renouvellement de la session pendant l’utilisation de l’espace connecté.', // JWT_TTL_SECONDS=3600 ; à maintenir aligné avec le déploiement.
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
