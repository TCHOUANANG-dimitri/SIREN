"""
Service de scoring temps réel exécuté à chaque réception de télémétrie.
Combine les couches 1, 2 et 3 du CDC.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from app.services.fusion_score import compute_fusion, SubScores, FusionResult
from app.crud.risk import crud_risk
from app.models.risk_score import RiskScore
from app.models.child import Child
from app.models.position import Position
from datetime import datetime, timezone
from typing import Optional
from app.core.timeutils import in_schedule, local_tz


async def compute_risk_score(
    db: AsyncSession,
    child: Child,
    position: Position,
    previous_position: Optional[Position] = None,
) -> FusionResult:
    sub = SubScores()

    # Couche 1 : Déclaratif (règles parent)
    sub.declaratif = await _evaluate_declarative(db, child, position)

    # Couche 2 : Détecteurs universels
    sub.universel = _evaluate_universal(position, previous_position)

    # Couche 3 : Itinéraire (si pack existe et confiance > 0)
    if child.model_confidence > 0:
        sub.geo = await _evaluate_geographical(db, child, position, previous_position)

    # Mouvement (IMU)
    sub.mouvement = _evaluate_movement(position)

    # Contexte
    contexte_nuit = _is_night_time(position.ts)
    hors_perimetre = sub.declaratif > 0.5

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


async def _evaluate_declarative(db: AsyncSession, child: Child, position: Position) -> float:
    from app.crud.geofence import crud_geofence
    from app.crud.place import crud_place

    score = 0.0
    for gf in await crud_geofence.list_by_child(db, child.id):
        if getattr(gf.type, "value", gf.type) != "interdit":
            continue
        distance = await _distance_m(db, position.geom, gf.geom)
        if distance is not None and distance <= (gf.radius_m or 100):
            score = max(score, 0.8)

    # Absent d'un lieu où il est censé être (école aux horaires déclarés, en heure locale).
    for place in await crud_place.list_by_child(db, child.id):
        for schedule in place.schedules:
            if in_schedule(schedule.jours, schedule.heure_debut, schedule.heure_fin, position.ts):
                distance = await _distance_m(db, position.geom, place.geom)
                if distance is not None and distance > place.radius_m:
                    score = max(score, 0.3)

    return min(score, 1.0)


def _evaluate_universal(position: Position, previous: Optional[Position]) -> float:
    score = 0.0
    if position.speed_kmh and position.speed_kmh > 80:
        score = max(score, 0.7)
    if getattr(position.fix_quality, "value", position.fix_quality) == "perdu":
        score = max(score, 0.6)
    if position.accuracy_m and position.accuracy_m > 500:
        score = max(score, 0.3)
    return min(score, 1.0)


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
    if position.imu_data:
        acc_max = position.imu_data.get("accMax", 0)
        if acc_max > 5:
            return 0.8
        if acc_max > 3:
            return 0.4
    return 0.0


def _is_night_time(dt: datetime) -> bool:
    h = dt.astimezone(local_tz()).hour
    return h < 6 or h >= 22
