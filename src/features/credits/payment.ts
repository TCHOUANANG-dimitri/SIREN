/**
 * Abstraction de paiement (CDC App §3, §10) — prestataire NON choisi
 * (Campay, Notch Pay, CinetPay… : décision d'équipe). Aucune intégration
 * réelle n'est livrée ; ce contrat fixe les invariants à respecter :
 *
 *  1. le client ne crédite JAMAIS un portefeuille : seul le serveur le fait,
 *     après vérification auprès du prestataire (webhook + réconciliation) ;
 *  2. chaque achat porte une clé d'idempotence : un double tap ou une
 *     nouvelle tentative réseau ne crée pas deux paiements ;
 *  3. le montant et le nombre de crédits viennent du catalogue serveur
 *     (prix des packs non validés : aucune valeur n'est codée dans l'app).
 */

export type PaymentMethod = 'mobile_money_orange' | 'mobile_money_mtn' | 'card';

export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'expired' | 'refunded';

export interface CreditPack {
  id: string;
  credits: number;
  priceXaf: number;
  label: string;
}

export interface PaymentIntent {
  id: string;
  packId: string;
  status: PaymentStatus;
  /** Instruction à afficher (ex. « Validez sur votre téléphone avec *126# »). */
  customerAction?: string;
  idempotencyKey: string;
}

export interface WalletTransaction {
  id: string;
  kind: 'purchase' | 'debit' | 'refund' | 'grant';
  credits: number; // positif = crédit, négatif = débit
  operation?: string;
  createdAt: string;
}

export interface WalletRepository {
  getBalance(): Promise<{ balance: number; asOf: string }>;
  listPacks(): Promise<CreditPack[]>;
  listTransactions(): Promise<WalletTransaction[]>;
  /** Crée une intention de paiement côté serveur ; le solde ne change qu'après confirmation serveur. */
  startPurchase(input: { packId: string; method: PaymentMethod; phone?: string; idempotencyKey: string }): Promise<PaymentIntent>;
  /** Interroge le serveur (qui a lui-même vérifié auprès du prestataire). */
  getPayment(paymentId: string): Promise<PaymentIntent>;
}

/** Clé d'idempotence stable pour une tentative d'achat (à conserver jusqu'à l'issue du paiement). */
export function newPurchaseKey(packId: string, now: number = Date.now()): string {
  return `purchase-${packId}-${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isFinal(status: PaymentStatus): boolean {
  return status !== 'pending';
}
