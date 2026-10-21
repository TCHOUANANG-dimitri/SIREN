/**
 * Transport local des trames du dispositif vers le téléphone.
 *
 * Aucune implémentation réelle (BLE…) : le protocole de référence ne définit
 * pas ce lien (T-BLE-01, BLOQUÉ). `SimulatedTransport` reproduit le
 * comportement attendu pour les tests et la démonstration : découverte,
 * connexion, trames au format « ; » du protocole (§7.1), coupures.
 */
export interface FrameTransportHandlers {
  onFound(deviceId: string): void;
  onConnected(): void;
  onFrame(frame: string): void;
  onLost(): void;
  onFailed(): void;
}

export interface FrameTransport {
  /** Recherche le dispositif `deviceId` et transmet ses trames tant que le lien tient. */
  start(deviceId: string, handlers: FrameTransportHandlers): void;
  stop(): void;
}

export class SimulatedTransport implements FrameTransport {
  private handlers: FrameTransportHandlers | null = null;
  private deviceId: string | null = null;

  start(deviceId: string, handlers: FrameTransportHandlers): void {
    this.deviceId = deviceId;
    this.handlers = handlers;
  }

  stop(): void {
    this.handlers = null;
    this.deviceId = null;
  }

  /** Simule l'apparition d'un boîtier à portée (éventuellement un AUTRE que celui attendu). */
  discover(deviceId = this.deviceId ?? ''): void {
    this.handlers?.onFound(deviceId);
  }

  connect(): void {
    this.handlers?.onConnected();
  }

  emit(frame: string): void {
    this.handlers?.onFrame(frame);
  }

  emitPosition(input: { lat: number; lon: number; ts: Date; battery?: number; speedKmh?: number; event?: string }): void {
    const id = this.deviceId ?? '';
    const fields = [
      id,
      input.lat.toFixed(6),
      input.lon.toFixed(6),
      input.battery ?? '',
      input.speedKmh ?? '',
      input.ts.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      input.event ?? '',
      '',
      '',
      '',
      '',
      '',
    ];
    this.emit(fields.join(';'));
  }

  lose(): void {
    this.handlers?.onLost();
  }

  fail(): void {
    this.handlers?.onFailed();
  }
}
