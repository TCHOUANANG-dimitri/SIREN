import { getDb, mutateDb, genId } from './db';
import { mockEventBus } from './mockEventBus';
import { computeFusionScore, stateFromScore, HysteresisGate } from './fusionScore';
import { destinationPoint, interpolate, bearingBetween } from '@/utils/geo';
import { DEMO_IDS, DEMO_HOME, DEMO_SCHOOL } from './seed';
import type { Alert, Place, Position, RiskScore, RiskState } from '@/models/entities';

type Phase = 'apprentissage' | 'anomalie' | 'urgence' | 'disparition' | 'stable';

interface ChildRuntime {
  childId: string;
  phase: Phase;
  phaseStartedAt: number;
  gate: HysteresisGate;
  learnedCheckpoints: Set<number>;
  disparitionTicks: number;
}

const TICK_MS = 4000;
const PHASE_APPRENTISSAGE_MS = 90_000;
const PHASE_ANOMALIE_MS = 45_000;

const runtimes = new Map<string, ChildRuntime>();
let intervalHandle: ReturnType<typeof setInterval> | null = null;

function nowIso() {
  return new Date().toISOString();
}

function initRuntime(childId: string, phase: Phase): ChildRuntime {
  return {
    childId,
    phase,
    phaseStartedAt: Date.now(),
    gate: new HysteresisGate('veille'),
    learnedCheckpoints: new Set(),
    disparitionTicks: 0,
  };
}

export function startScenarioEngine() {
  if (intervalHandle) return;
  const db = getDb();
  runtimes.clear();
  for (const child of db.children) {
    const phase: Phase = child.id === DEMO_IDS.leaId ? 'apprentissage' : 'stable';
    runtimes.set(child.id, initRuntime(child.id, phase));
  }
  intervalHandle = setInterval(tickAll, TICK_MS);
  mockEventBus.emit({ type: 'connection', status: 'connected' });
}

export function stopScenarioEngine() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

export function resetScenarioEngine() {
  stopScenarioEngine();
  startScenarioEngine();
}

export function isScenarioRunning() {
  return intervalHandle !== null;
}

/** Appelé après acquittement / fausse alerte / résolution — CDC1 §9.17. */
export function resolveScenarioAlert(childId: string) {
  const rt = runtimes.get(childId);
  if (!rt || childId !== DEMO_IDS.leaId) return;
  rt.phase = 'apprentissage';
  rt.phaseStartedAt = Date.now();
  rt.gate.reset('veille');
}

/** POST /children/{id}/disappearance */
export function triggerScenarioDisappearance(childId: string) {
  const rt = runtimes.get(childId);
  if (!rt) return;
  rt.phase = 'disparition';
  rt.phaseStartedAt = Date.now();
  rt.disparitionTicks = 0;
}

/** POST /children/{id}/position/request — force un tick immédiat pour un enfant. */
export function requestImmediateFix(childId: string) {
  const rt = runtimes.get(childId);
  if (rt) tickChild(rt);
}

function tickAll() {
  for (const rt of runtimes.values()) tickChild(rt);
}

function lastPosition(childId: string): Position | undefined {
  const db = getDb();
  const hist = db.positions[childId];
  if (!hist || hist.length === 0) return undefined;
  return hist[hist.length - 1];
}

function pushPosition(childId: string, position: Position) {
  mutateDb((db) => {
    const hist = db.positions[childId] ?? [];
    hist.push(position);
    if (hist.length > 500) hist.shift();
    db.positions[childId] = hist;
  });
  mockEventBus.emit({ type: 'position_update', childId, position });
}

function pushRisk(childId: string, risk: RiskScore) {
  mutateDb((db) => {
    db.riskScores[childId] = risk;
    const hist = db.riskHistory[childId] ?? [];
    hist.push(risk);
    if (hist.length > 300) hist.shift();
    db.riskHistory[childId] = hist;
  });
  mockEventBus.emit({ type: 'risk_update', childId, risk });
}

function createAlertIfEscalation(childId: string, from: RiskState, to: RiskState, risk: RiskScore) {
  if (to !== 'prealerte' && to !== 'urgence') return;
  if (from === to) return;
  const alert: Alert = {
    id: genId('alert'),
    childId,
    level: to,
    score: risk.score,
    reasons: risk.reasons,
    lat: undefined,
    lon: undefined,
    createdAt: nowIso(),
    status: 'active',
  };
  const pos = lastPosition(childId);
  if (pos) {
    alert.lat = pos.lat;
    alert.lon = pos.lon;
  }
  mutateDb((db) => {
    db.alerts.unshift(alert);
  });
  mockEventBus.emit({ type: 'alert', alert });
}

function maybeLearnPlace(rt: ChildRuntime, progress: number) {
  const checkpoints = [0.4, 0.75];
  for (const cp of checkpoints) {
    if (progress >= cp && !rt.learnedCheckpoints.has(cp)) {
      rt.learnedCheckpoints.add(cp);
      const nearSchool = cp > 0.5;
      const base = nearSchool ? DEMO_SCHOOL : DEMO_HOME;
      const place: Place = {
        id: genId('place'),
        childId: rt.childId,
        nom: nearSchool ? 'Marché du quartier' : 'Chez grand-mère',
        lat: base.lat + (Math.random() - 0.5) * 0.004,
        lon: base.lon + (Math.random() - 0.5) * 0.004,
        radiusM: 60,
        source: 'appris',
        visitCount: 3,
        isNew: true,
        icon: 'lieu',
      };
      mutateDb((db) => {
        db.places.push(place);
      });
      mockEventBus.emit({ type: 'place_learned', childId: rt.childId, placeId: place.id });
    }
  }
}

function buildReasons(params: {
  sUniversel: number;
  sDeclaratif: number;
  sGeo: number;
  sMouvement: number;
  contexteNuit: boolean;
  horsPerimetre: boolean;
}): string[] {
  const reasons: string[] = [];
  if (params.sGeo >= 0.5) reasons.push('Route inconnue');
  if (params.sUniversel >= 0.5) reasons.push('Vitesse inhabituelle (véhicule)');
  if (params.sDeclaratif >= 0.5) reasons.push('Sortie du périmètre autorisé');
  if (params.sMouvement >= 0.5) reasons.push('Mouvement brusque détecté');
  if (params.horsPerimetre) reasons.push('Hors du périmètre déclaré');
  if (params.contexteNuit) reasons.push('Déplacement en heures de sommeil');
  return reasons.length ? reasons : ['Activité normale'];
}

function tickChild(rt: ChildRuntime) {
  const lastPos = lastPosition(rt.childId);
  if (!lastPos) return;
  const db = getDb();
  const child = db.children.find((c) => c.id === rt.childId);
  if (!child) return;
  const elapsed = Date.now() - rt.phaseStartedAt;

  if (rt.phase === 'disparition') {
    tickDisparition(rt);
    return;
  }

  let sUniversel = 0.05 + Math.random() * 0.05;
  let sDeclaratif = 0;
  let sGeo = 0.1;
  let sMouvement = 0.05 + Math.random() * 0.05;
  let contexteNuit = false;
  let horsPerimetre = false;
  let confidenceDelta = 0;
  let position: Position;

  const prevPos = lastPosition(rt.childId) ?? {
    lat: DEMO_HOME.lat,
    lon: DEMO_HOME.lon,
    speedKmh: 0,
    timestamp: nowIso(),
    accuracyM: 10,
    fixQuality: 'gps_recent' as const,
  };

  switch (rt.phase) {
    case 'stable': {
      const jitter = destinationPoint(DEMO_HOME.lat, DEMO_HOME.lon, Math.random() * 15, Math.random() * 360);
      position = { lat: jitter.lat, lon: jitter.lon, speedKmh: 0, timestamp: nowIso(), accuracyM: 8, fixQuality: 'gps_recent' };
      confidenceDelta = child.modelConfidence < 95 ? 0.1 : 0;
      break;
    }
    case 'apprentissage': {
      const progress = Math.min(1, elapsed / PHASE_APPRENTISSAGE_MS);
      const oscillating = Math.abs(((progress * 2) % 2) - 1);
      const pt = interpolate(DEMO_HOME.lat, DEMO_HOME.lon, DEMO_SCHOOL.lat, DEMO_SCHOOL.lon, oscillating);
      position = { lat: pt.lat, lon: pt.lon, speedKmh: 4 + Math.random() * 3, timestamp: nowIso(), accuracyM: 10, fixQuality: 'gps_recent' };
      sGeo = Math.max(0.08, 0.8 - 0.7 * progress);
      confidenceDelta = (62 / (PHASE_APPRENTISSAGE_MS / TICK_MS)) * (child.modelConfidence < 70 ? 1 : 0.1);
      maybeLearnPlace(rt, progress);
      if (progress >= 1) {
        rt.phase = 'anomalie';
        rt.phaseStartedAt = Date.now();
      }
      break;
    }
    case 'anomalie': {
      const bearing = bearingBetween(DEMO_HOME.lat, DEMO_HOME.lon, DEMO_SCHOOL.lat, DEMO_SCHOOL.lon) + 90;
      const deviated = destinationPoint(prevPos.lat, prevPos.lon, 40, bearing);
      position = { lat: deviated.lat, lon: deviated.lon, speedKmh: 6 + Math.random() * 2, timestamp: nowIso(), accuracyM: 14, fixQuality: 'gps_recent' };
      sUniversel = 0.5;
      sGeo = 0.9;
      sMouvement = 0.2;
      if (elapsed >= PHASE_ANOMALIE_MS) {
        rt.phase = 'urgence';
        rt.phaseStartedAt = Date.now();
      }
      break;
    }
    case 'urgence': {
      const bearing = bearingBetween(DEMO_HOME.lat, DEMO_HOME.lon, DEMO_SCHOOL.lat, DEMO_SCHOOL.lon) + 90;
      const moved = destinationPoint(prevPos.lat, prevPos.lon, 250, bearing);
      position = { lat: moved.lat, lon: moved.lon, speedKmh: 55 + Math.random() * 10, timestamp: nowIso(), accuracyM: 20, fixQuality: 'gps_recent', heading: bearing };
      sUniversel = 0.85;
      sDeclaratif = 0.9;
      sGeo = 0.9;
      sMouvement = 0.3;
      contexteNuit = true;
      horsPerimetre = true;
      break;
    }
    default:
      position = prevPos;
  }

  if (confidenceDelta) {
    mutateDb((db2) => {
      const c = db2.children.find((x) => x.id === rt.childId);
      if (c) c.modelConfidence = Math.min(95, c.modelConfidence + confidenceDelta);
    });
  }

  pushPosition(rt.childId, position);

  const confidence = db.children.find((c) => c.id === rt.childId)?.modelConfidence ?? 50;
  const fusion = computeFusionScore({
    sUniversel,
    sDeclaratif,
    sGeo,
    sMouvement,
    confidence,
    contexteNuit,
    horsPerimetre,
  });
  const rawState = stateFromScore(fusion.score);
  const from = rt.gate.currentState;
  const to = rt.gate.update(rawState, fusion.score);

  const risk: RiskScore = {
    childId: rt.childId,
    score: fusion.score,
    state: to,
    confidence,
    reasons: buildReasons({ sUniversel, sDeclaratif, sGeo, sMouvement, contexteNuit, horsPerimetre }),
    subScores: { geo: fusion.sGeoEff, mouvement: sMouvement, universel: sUniversel, declaratif: sDeclaratif },
    timestamp: nowIso(),
  };
  pushRisk(rt.childId, risk);

  if (from !== to) {
    mockEventBus.emit({ type: 'state_change', childId: rt.childId, from, to });
    createAlertIfEscalation(rt.childId, from, to, risk);
  }
}

function tickDisparition(rt: ChildRuntime) {
  rt.disparitionTicks += 1;
  const lastPos = lastPosition(rt.childId);

  mutateDb((db2) => {
    const child = db2.children.find((c) => c.id === rt.childId);
    const deviceId = child?.deviceId;
    const device = deviceId ? db2.devices.find((d) => d.deviceId === deviceId) : undefined;
    if (device) {
      device.fixQuality = rt.disparitionTicks === 1 ? 'estimee' : 'perdu';
      device.online = rt.disparitionTicks < 3;
    }
    db2.riskScores[rt.childId] = {
      ...db2.riskScores[rt.childId],
      state: 'disparition',
      score: 100,
      reasons: ['Disparition confirmée — signal perdu'],
      timestamp: nowIso(),
    };
  });

  if (rt.disparitionTicks === 1 && lastPos) {
    const confidence = Math.max(15, 90 - rt.disparitionTicks * 15);
    const heading = lastPos.heading ?? 90;
    const speedMs = (lastPos.speedKmh || 40) / 3.6;
    const cells = [];
    const topZones = [];
    const labels = ['Zone nord', 'Zone est', 'Zone sud-est', 'Zone sud', 'Zone ouest'];
    for (let i = 0; i < 5; i += 1) {
      const angleOffset = (i - 2) * 22;
      const distance = speedMs * 60 * (8 + i * 4); // décroissance directionnelle simple
      const pt = destinationPoint(lastPos.lat, lastPos.lon, distance, heading + angleOffset);
      const weight = Math.max(0.1, 1 - i * 0.18);
      cells.push({ lat: pt.lat, lon: pt.lon, weight });
      topZones.push({ lat: pt.lat, lon: pt.lon, label: labels[i], rank: i + 1 });
    }
    mutateDb((db2) => {
      db2.searchZones[rt.childId] = {
        childId: rt.childId,
        lastPoint: lastPos,
        generatedAt: nowIso(),
        confidence,
        cells,
        topZones: topZones.slice(0, 3),
      };
    });
  }

  mockEventBus.emit({
    type: 'risk_update',
    childId: rt.childId,
    risk: getDb().riskScores[rt.childId],
  });
}
