"""
Service de scoring temps réel exécuté à chaque réception de télémétrie.
Combine les couches 1, 2 et 3 du CDC.

Couches 1 et 2 déléguées aux modules purs testés :
- app.rules.declarative.evaluate_declarative (zones + horaires + périmètre de vie)
- app.rules.universal.evaluate_universal (vitesse, perte signal, précision, choc, saut)
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.services.fusion_score import compute_fusion, SubScores, FusionResult
from app.crud.risk import crud_risk
from app.models.risk_score import RiskScore
from app.models.child import Child
from app.models.position import Position
from datetime import datetime, timezone
from typing import Optional, Tuple, List
from zoneinfo import ZoneInfo

from app.rules.declarative import (
    Geofence as RuleGeofence,
    Place as RulePlace,
    PlaceSchedule as RuleSchedule,
    evaluate_declarative,
    TIMEZONE as DOUALA_TZ,
    DEFAULT_PLACE_RADIUS_M,
)
from app.rules.geo import Point
from app.rules.universal import TelemetryPoint, evaluate_universal

GEO_MARGIN_FALLBACK_RADIUS_M = 100.0


def _parse_wkt_point_lonlat(raw: str) -> Optional[Tuple[float, float]]:
    """Parse 'POINT(lon lat)' -> (lat, lon). Retourne None si impossible."""
    try:
        s = raw.strip()
        if "POINT" not in s:
            return None
        inner = s[s.index("(") + 1:s.index(")")]
        parts = inner.strip().split()
        if len(parts) < 2:
            return None
        lon, lat = float(parts[0]), float(parts[1])
        return lat, lon
    except Exception:
        return None


def _geom_to_wkt_text(geom) -> Optional[str]:
    if geom is None:
        return None
    # WKTElement (avant flush) expose .data ; WKBElement expose .data en binaire
    data = getattr(geom, "data", None)
    if isinstance(data, str) and "POINT" in data:
        return data
    if isinstance(data, (bytes, bytearray)):
        return None  # binaire -> passer par ST_AsText en base
    try:
        txt = str(geom)
        if "POINT" in txt:
            return txt
    except Exception:
        pass
    return None


async def _geom_to_latlon(db: AsyncSession, geom) -> Optional[Tuple[float, float]]:
    """Extrait (lat, lon) d'une géométrie POINT, en WKT direct ou via PostGIS."""
    wkt = _geom_to_wkt_text(geom)
    if wkt:
        parsed = _parse_wkt_point_lonlat(wkt)
        if parsed:
            return parsed
    try:
        from geoalchemy2 import functions as geo_func
        row = (await db.execute(
            select(geo_func.ST_Y(geom).label("lat"), geo_func.ST_X(geom).label("lon"))
        )).first()
        if row and row[0] is not None and row[1] is not None:
            return float(row[0]), float(row[1])
    except Exception:
        pass
    return None


def _as_douala(dt: datetime) -> datetime:
    if dt is None:
        return datetime.now(DOUALA_TZ)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(DOUALA_TZ)


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


def _fix_quality_str(position: Position) -> Optional[str]:
    fq = getattr(position, "fix_quality", None)
    if fq is None:
        return None
    return fq.value if hasattr(fq, "value") else str(fq)


async def compute_risk_score(
    db: AsyncSession,
    child: Child,
    position: Position,
    previous_position: Optional[Position] = None,
) -> FusionResult:
    sub = SubScores()
    detail_reasons: List[str] = []

    # Couche 1 : Déclaratif (règles parent) via module pur
    decl_score, decl_reasons = await _evaluate_declarative(db, child, position)
    sub.declaratif = decl_score
    detail_reasons.extend(decl_reasons)

    # Couche 2 : Détecteurs universels via module pur
    univ_score, univ_reasons = _evaluate_universal(position, previous_position)
    sub.universel = univ_score
    detail_reasons.extend(univ_reasons)

    # Couche 3 : Itinéraire (si pack existe et confiance > 0)
    if child.model_confidence > 0:
        sub.geo = await _evaluate_geographical(db, child, position, previous_position)

    # Mouvement (IMU)
    sub.mouvement = _evaluate_movement(position)

    # Contexte : nuit évaluée à Douala ; hors périmètre dès 0.5 (0.6/0.8)
    ts = getattr(position, "ts", None) or datetime.now(timezone.utc)
    contexte_nuit = _is_night_time(ts)
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
        detail_reasons=detail_reasons,
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


async def _evaluate_declarative(db: AsyncSession, child: Child, position: Position) -> Tuple[float, List[str]]:
    from app.crud.geofence import crud_geofence
    from app.crud.place import crud_place

    pos_ll = await _geom_to_latlon(db, position.geom)
    if not pos_ll:
        return 0.0, []
    pos = Point(lat=pos_ll[0], lon=pos_ll[1])

    rule_geofences: List[RuleGeofence] = []
    for gf in await crud_geofence.list_by_child(db, child.id):
        ll = await _geom_to_latlon(db, gf.geom)
        if not ll:
            continue
        gtype = gf.type.value if hasattr(gf.type, "value") else str(gf.type)
        radius = getattr(gf, "radius_m", None) or GEO_MARGIN_FALLBACK_RADIUS_M
        try:
            radius = float(radius)
        except (TypeError, ValueError):
            radius = GEO_MARGIN_FALLBACK_RADIUS_M
        rule_geofences.append(RuleGeofence(id=str(gf.id), type=gtype, center=Point(lat=ll[0], lon=ll[1]), radius_m=radius))

    rule_places: List[RulePlace] = []
    for pl in await crud_place.list_by_child(db, child.id):
        # Seuls les lieux déclarés alimentent la couche 1 (les "appris" = couche 3)
        source = getattr(pl.source, "value", str(pl.source)) if getattr(pl, "source", None) is not None else "declare"
        if source != "declare":
            continue
        ll = await _geom_to_latlon(db, pl.geom)
        if not ll:
            continue
        try:
            radius = float(pl.radius_m or DEFAULT_PLACE_RADIUS_M)
        except (TypeError, ValueError):
            radius = DEFAULT_PLACE_RADIUS_M
        scheds: List[RuleSchedule] = []
        for s in getattr(pl, "schedules", []) or []:
            try:
                scheds.append(RuleSchedule(jours=list(s.jours or []), heure_debut=s.heure_debut, heure_fin=s.heure_fin))
            except Exception:
                continue
        rule_places.append(RulePlace(id=str(pl.id), center=Point(lat=ll[0], lon=ll[1]), radius_m=radius, schedules=scheds))

    ts = getattr(position, "ts", None) or datetime.now(timezone.utc)
    res = evaluate_declarative(rule_geofences, rule_places, pos, now=_as_douala(ts))
    return min(max(res.score, 0.0), 1.0), list(res.reasons)


def _telemetry_from_position(position: Position, lat: float = 0.0, lon: float = 0.0, fallback_ts=None) -> TelemetryPoint:
    ts = getattr(position, "ts", None) or fallback_ts or datetime.now(timezone.utc)
    if ts is not None and ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return TelemetryPoint(
        position=Point(lat=lat, lon=lon),
        ts=ts,
        speed_kmh=float(position.speed_kmh) if getattr(position, "speed_kmh", None) is not None else None,
        accuracy_m=float(position.accuracy_m) if getattr(position, "accuracy_m", None) is not None else None,
        fix_quality=_fix_quality_str(position),
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
    acc_max = _acc_max_from_imu(getattr(position, "imu_data", None))
    if acc_max is None:
        return 0.0
    if acc_max > 5:
        return 0.8
    if acc_max > 3:
        return 0.4
    return 0.0


def _is_night_time(dt: datetime) -> bool:
    h = _as_douala(dt).hour
    return h < 6 or h >= 22
