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


async def persist_risk_score(db: AsyncSession, child_id: str, result: FusionResult) -> RiskScore:
    risk = RiskScore(
        child_id=child_id,
        score=result.score,
        state=result.state,
        confidence=100,
        reasons={"reasons": result.reasons},
        sub_scores=result.sub_scores,
        ts=datetime.now(timezone.utc),
    )
    db.add(risk)
    await db.flush()
    return risk


async def _evaluate_declarative(db: AsyncSession, child: Child, position: Position) -> float:
    score = 0.0
    from app.crud.geofence import crud_geofence
    from geoalchemy2 import functions as geo_func

    geofences = await crud_geofence.list_by_child(db, child.id)
    for gf in geofences:
        if gf.type == "interdit":
            within = await db.execute(
                geo_func.ST_Within(position.geom, gf.geom)
            )
            if within.scalar():
                score = max(score, 0.8)

    from app.crud.place import crud_place
    places = await crud_place.list_by_child(db, child.id)
    now = datetime.now(timezone.utc)
    current_hour = now.hour
    current_dow = now.weekday()

    for place in places:
        for schedule in place.schedules:
            if current_dow in schedule.jours:
                if schedule.heure_debut.hour <= current_hour <= schedule.heure_fin.hour:
                    distance = await db.execute(
                        geo_func.ST_Distance(position.geom, place.geom)
                    )
                    dist_m = distance.scalar()
                    if dist_m and dist_m > place.radius_m:
                        score = max(score, 0.3)

    return min(score, 1.0)


def _evaluate_universal(position: Position, previous: Optional[Position]) -> float:
    score = 0.0
    if position.speed_kmh and position.speed_kmh > 80:
        score = max(score, 0.7)
    if position.fix_quality == "perdu":
        score = max(score, 0.6)
    if position.accuracy_m and position.accuracy_m > 500:
        score = max(score, 0.3)
    return min(score, 1.0)


async def _evaluate_geographical(db: AsyncSession, child: Child, position: Position, previous: Optional[Position]) -> float:
    if not previous:
        return 0.0

    from geoalchemy2 import functions as geo_func
    from app.crud.place import crud_place

    places = await crud_place.list_by_child(db, child.id)
    near_known_place = False
    for place in places:
        d = await db.execute(geo_func.ST_Distance(position.geom, place.geom))
        if d.scalar() and d.scalar() < place.radius_m:
            near_known_place = True
            break

    if not near_known_place:
        return 0.4
    return 0.1


def _evaluate_movement(position: Position) -> float:
    if position.imu_data:
        acc_max = position.imu_data.get("accMax", 0)
        if acc_max > 5:
            return 0.8
        if acc_max > 3:
            return 0.4
    return 0.0


def _is_night_time(dt: datetime) -> bool:
    h = dt.hour
    return h < 6 or h >= 22
