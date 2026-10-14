"""
Service de scoring temps réel exécuté à chaque réception de télémétrie.
Combine les couches 1, 2 et 3 du CDC.

- Couche 1 (déclaratif) : zones interdites (0,8) > sortie périmètre de vie (0,6)
  > hors-horaire attendu (0,3). Distances en mètres (ST_DistanceSphere),
  horaires en heure locale (app.core.timeutils, convention app 0=dimanche).
- Couche 2 (universel) : déléguée à app.rules.universal (vitesse 2 paliers,
  perte signal, précision, chocs IMU, saut soudain).
"""

from sqlalchemy.ext.asyncio import AsyncSession
from app.services.fusion_score import compute_fusion, SubScores, FusionResult
from app.crud.risk import crud_risk
from app.models.risk_score import RiskScore
from app.models.child import Child
from app.models.position import Position
from datetime import datetime, timezone
from typing import List, Optional, Tuple
from app.core.geo import point_lat_lon
from app.core.timeutils import in_schedule, local_tz

from app.rules.declarative import (
    SCORE_HORS_HORAIRE,
    SCORE_HORS_PERIMETRE,
    SCORE_ZONE_INTERDITE,
    GPS_MARGIN_M,
)
from app.rules.geo import Point
from app.rules.universal import TelemetryPoint, evaluate_universal


async def compute_risk_score(
    db: AsyncSession,
    child: Child,
    position: Position,
    previous_position: Optional[Position] = None,
) -> FusionResult:
    sub = SubScores()

    # Couche 1 : Déclaratif (règles parent)
    decl_score, decl_reasons = await _evaluate_declarative(db, child, position)
    sub.declaratif = decl_score

    # Couche 2 : Détecteurs universels
    univ_score, univ_reasons = _evaluate_universal(position, previous_position)
    sub.universel = univ_score

    # Couche 3 : Itinéraire (si pack existe et confiance > 0)
    if child.model_confidence > 0:
        sub.geo = await _evaluate_geographical(db, child, position, previous_position)

    # Mouvement (IMU)
    sub.mouvement = _evaluate_movement(position)

    # Contexte
    contexte_nuit = _is_night_time(position.ts)
    hors_perimetre = sub.declaratif >= 0.5

    # Récupérer l'état précédent pour l'hystérésis
    last_risk = await crud_risk.get_latest(db, child.id)
    previous_state = last_risk.state if last_risk else None

    confidence = child.model_confidence / 100.0

    result = compute_fusion(
        sub=sub,
        model_confidence=confidence,
        contexte_nuit=contexte_nuit,
        hors_perimetre=hors_perimetre,
        previous_state=previous_state,
        detail_reasons=[*decl_reasons, *univ_reasons],
    )

    return result


async def persist_risk_score(db: AsyncSession, child: Child, result: FusionResult) -> RiskScore:
    risk = RiskScore(
        child_id=child.id,
        score=result.score,
        state=result.state,
        # Maturité réelle de la couche 3 (était figée à 100).
        confidence=child.model_confidence,
        reasons={"reasons": result.reasons},
        sub_scores=result.sub_scores,
        ts=datetime.now(timezone.utc),
    )
    db.add(risk)
    await db.flush()
    return risk


async def _distance_m(db: AsyncSession, a, b) -> Optional[float]:
    """Distance en mètres (ST_DistanceSphere) — ST_Distance en SRID 4326 renvoie des degrés."""
    from sqlalchemy import select
    from geoalchemy2 import functions as geo_func

    return (await db.execute(select(geo_func.ST_DistanceSphere(a, b)))).scalar()


async def _evaluate_declarative(db: AsyncSession, child: Child, position: Position) -> Tuple[float, List[str]]:
    from app.crud.geofence import crud_geofence
    from app.crud.place import crud_place

    fences = await crud_geofence.list_by_child(db, child.id)

    # R1 — Zones interdites (priorité absolue).
    for gf in fences:
        if getattr(gf.type, "value", gf.type) != "interdit":
            continue
        distance = await _distance_m(db, position.geom, gf.geom)
        if distance is not None and distance <= (gf.radius_m or 100) + GPS_MARGIN_M:
            return SCORE_ZONE_INTERDITE, [f"zone_interdite:{gf.id}"]

    # Horaires : quel lieu gouverne ce moment, et l'enfant y est-il ?
    # (calculé avant R2 : être au bon lieu annule la sortie périmètre,
    # cas de l'école hors quartier).
    governs_now = False
    inside_expected = False
    for place in await crud_place.list_by_child(db, child.id):
        for schedule in place.schedules:
            if in_schedule(schedule.jours, schedule.heure_debut, schedule.heure_fin, position.ts):
                governs_now = True
                distance = await _distance_m(db, position.geom, place.geom)
                if distance is not None and distance <= (place.radius_m or 100) + GPS_MARGIN_M:
                    inside_expected = True

    # R2 — Sortie du périmètre de vie (périmètres "autorise").
    autorises = [gf for gf in fences if getattr(gf.type, "value", gf.type) == "autorise"]
    if autorises:
        inside_perimetre = False
        for gf in autorises:
            distance = await _distance_m(db, position.geom, gf.geom)
            if distance is not None and distance <= (gf.radius_m or 100) + GPS_MARGIN_M:
                inside_perimetre = True
                break
        if not inside_perimetre and not (governs_now and inside_expected):
            ids = ",".join(str(gf.id) for gf in autorises)
            return SCORE_HORS_PERIMETRE, [f"hors_perimetre:{ids}"]

    # R3 — Hors horaire attendu.
    if governs_now and not inside_expected:
        return SCORE_HORS_HORAIRE, ["hors_horaire_attendu"]

    return 0.0, []


def _acc_max_from_imu(imu) -> Optional[float]:
    if not isinstance(imu, dict):
        return None
    for key in ("accMax", "acc_max", "accMaxMs2", "acc_max_ms2"):
        if key in imu and imu[key] is not None:
            try:
                return float(imu[key])
            except (TypeError, ValueError):
                continue
    return None


def _telemetry_from_position(position: Position) -> TelemetryPoint:
    ll = point_lat_lon(position.geom) or (0.0, 0.0)
    ts = getattr(position, "ts", None) or datetime.now(timezone.utc)
    if ts is not None and ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    fq = getattr(position, "fix_quality", None)
    return TelemetryPoint(
        position=Point(lat=ll[0], lon=ll[1]),
        ts=ts,
        speed_kmh=float(position.speed_kmh) if getattr(position, "speed_kmh", None) is not None else None,
        accuracy_m=float(position.accuracy_m) if getattr(position, "accuracy_m", None) is not None else None,
        fix_quality=fq.value if hasattr(fq, "value") else (str(fq) if fq is not None else None),
        acc_max_ms2=_acc_max_from_imu(getattr(position, "imu_data", None)),
    )


def _evaluate_universal(position: Position, previous: Optional[Position]) -> Tuple[float, List[str]]:
    cur = _telemetry_from_position(position)
    prev = _telemetry_from_position(previous) if previous is not None else None
    res = evaluate_universal(cur, prev)
    return min(max(res.score, 0.0), 1.0), list(res.reasons)


async def _evaluate_geographical(db: AsyncSession, child: Child, position: Position, previous: Optional[Position]) -> float:
    if not previous:
        return 0.0
    from app.crud.place import crud_place

    for place in await crud_place.list_by_child(db, child.id):
        distance = await _distance_m(db, position.geom, place.geom)
        if distance is not None and distance < place.radius_m:
            return 0.1
    return 0.4


def _evaluate_movement(position: Position) -> float:
    acc_max = _acc_max_from_imu(getattr(position, "imu_data", None))
    if acc_max is None:
        return 0.0
    if acc_max > 5:
        return 0.8
    if acc_max > 3:
        return 0.4
    return 0.0


def _is_night_time(dt: datetime) -> bool:
    if dt is None:
        return False
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    h = dt.astimezone(local_tz()).hour
    return h < 6 or h >= 22
