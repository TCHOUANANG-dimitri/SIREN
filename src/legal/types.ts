/**
 * Documents juridiques — modèle.
 *
 * Le texte vit dans src/legal/content/<langue>.ts (une langue par fichier, jamais
 * mélangées) ; les métadonnées (version, dates, statut) dans registry.ts. Les
 * écrans ne contiennent aucun texte juridique.
 */
export type LegalDocumentId = 'legal-notice' | 'privacy' | 'terms' | 'rules' | 'children-data';

/**
 * `draft`     : rédigé par l'équipe, NON validé par un juriste — affiché avec un
 *               bandeau « version provisoire » ;
 * `validated` : validé juridiquement (à renseigner par l'équipe, jamais par défaut).
 */
export type LegalStatus = 'draft' | 'validated';

export interface LegalDocumentMeta {
  id: LegalDocumentId;
  /** Version affichée et enregistrée lors de l'acceptation (format AAAA-MM-JJ[.n]). */
  version: string;
  publishedAt: string;
  effectiveAt: string;
  status: LegalStatus;
  /** Doit être accepté explicitement à l'inscription. */
  requiresAcceptance: boolean;
}

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalContent {
  title: string;
  /** Une phrase affichée dans la liste des documents. */
  summary: string;
  sections: LegalSection[];
}

export type LegalCatalog = Record<LegalDocumentId, LegalContent>;
