import type { AppLanguage } from '@/stores/preferencesStore';
import type { LegalCatalog, LegalContent, LegalDocumentId, LegalDocumentMeta } from './types';
import { legalFr } from './content/fr';
import { legalEn } from './content/en';

/**
 * Registre des documents juridiques (source unique).
 *
 * Changer un texte = incrémenter sa `version` et ses dates. Si le document exige
 * une acceptation, la nouvelle version devra être ré-acceptée (le serveur
 * enregistre les versions acceptées : users.terms_version / privacy_version).
 *
 * STATUT : tous les documents sont `draft`. Ils ne constituent PAS une validation
 * juridique ; voir docs/JURIDIQUE.md (sources, points à faire valider).
 */
export const LEGAL_DOCUMENTS: readonly LegalDocumentMeta[] = [
  { id: 'legal-notice', version: '2026-09-30', publishedAt: '2026-09-30', effectiveAt: '2026-09-30', status: 'draft', requiresAcceptance: false },
  { id: 'privacy', version: '2026-09-30', publishedAt: '2026-09-30', effectiveAt: '2026-09-30', status: 'draft', requiresAcceptance: true },
  { id: 'terms', version: '2026-09-30', publishedAt: '2026-09-30', effectiveAt: '2026-09-30', status: 'draft', requiresAcceptance: true },
  { id: 'rules', version: '2026-09-30', publishedAt: '2026-09-30', effectiveAt: '2026-09-30', status: 'draft', requiresAcceptance: false },
  { id: 'children-data', version: '2026-09-30', publishedAt: '2026-09-30', effectiveAt: '2026-09-30', status: 'draft', requiresAcceptance: false },
];

const CATALOGS: Record<AppLanguage, LegalCatalog> = { fr: legalFr, en: legalEn };

export function legalMeta(id: LegalDocumentId): LegalDocumentMeta {
  const meta = LEGAL_DOCUMENTS.find((d) => d.id === id);
  if (!meta) throw new Error(`Document juridique inconnu : ${id}`);
  return meta;
}

export function isLegalDocumentId(value: unknown): value is LegalDocumentId {
  return typeof value === 'string' && LEGAL_DOCUMENTS.some((d) => d.id === value);
}

/** Contenu dans la langue demandée (FR si la langue n'est pas disponible). */
export function legalContent(id: LegalDocumentId, language: string): LegalContent {
  const catalog = CATALOGS[language === 'en' ? 'en' : 'fr'];
  return catalog[id];
}

/** Versions à transmettre au serveur lors de l'inscription (preuve du consentement). */
export function acceptanceVersions(): { acceptedTermsVersion: string; acceptedPrivacyVersion: string } {
  return { acceptedTermsVersion: legalMeta('terms').version, acceptedPrivacyVersion: legalMeta('privacy').version };
}
