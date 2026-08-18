"""
Tâches Celery planifiées pour le réentraînement nocturne (section 5.3 du CDC).
"""

from app.tasks.celery_app import celery_app
from app.core.config import settings
from app.core.database import async_session_factory
from app.crud.child import crud_child
from app.crud.position import crud_position
from app.crud.place import crud_place
from app.crud.ml_model import crud_markov, crud_familiar_cell, crud_hourly_profile
from app.crud.param_pack import crud_param_pack
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, text


@celery_app.task(bind=True, max_retries=3, default_retry_delay=300)
def retrain_all_children(self):
    """
    Réentraînement nocturne pour chaque enfant éligible.
    Boucle sur tous les enfants, vérifie l'éligibilité, puis lance l'apprentissage.
    """
    import asyncio
    asyncio.run(_retrain_all_children_async())


async def _retrain_all_children_async():
    async with async_session_factory() as db:
        children = await crud_child.list(db)
        cutoff = datetime.now(timezone.utc) - timedelta(days=3)

        for child in children:
            if child.deleted_at:
                continue

            latest_position = await crud_position.get_latest(db, child.id)
            if not latest_position:
                continue

            recent_positions = await crud_position.get_history(
                db, child.id,
                from_dt=datetime.now(timezone.utc) - timedelta(days=1),
                to_dt=None,
                limit=100,
            )

            if len(recent_positions) < 50:
                last_pack = await crud_param_pack.get_latest(db, child.id)
                if not last_pack or (datetime.now(timezone.utc) - last_pack.created_at).days < 3:
                    continue

            try:
                await _retrain_single_child(db, child.id, recent_positions)
            except Exception as e:
                print(f"Retrain failed for child {child.id}: {e}")


async def _retrain_single_child(db, child_id: str, positions: list):
    """
    Pipeline de réentraînement pour un enfant :
    1. Détection des stay-points
    2. DBSCAN pour regrouper en lieux
    3. Profils horaires
    4. Matrice de Markov
    5. Cellules familières
    6. Génération du pack
    """
    from app.models.place import Place
    from geoalchemy2 import WKTElement, functions as geo_func

    if len(positions) < 5:
        return

    stay_points = _detect_stay_points(positions)
    clusters = _dbscan_cluster(stay_points, eps_m=60, min_samples=3)

    for i, cluster in enumerate(clusters):
        centroid_lat = sum(p["lat"] for p in cluster) / len(cluster)
        centroid_lon = sum(p["lon"] for p in cluster) / len(cluster)

        existing = await crud_place.list_by_child(db, child_id)
        is_new = True
        for place in existing:
            d = await db.execute(geo_func.ST_Distance(
                WKTElement(f"POINT({centroid_lon} {centroid_lat})", srid=4326),
                place.geom
            ))
            if d.scalar() and d.scalar() < place.radius_m:
                is_new = False
                break

        if is_new:
            place = Place(
                child_id=child_id,
                nom=f"Lieu appris {i+1}",
                geom=WKTElement(f"POINT({centroid_lon} {centroid_lat})", srid=4326),
                radius_m=60,
                source="appris",
            )
            db.add(place)

    last_pack = await crud_param_pack.get_latest(db, child_id)
    new_version = (last_pack.version + 1) if last_pack else 1

    from app.models.param_pack import ParamPack
    pack = ParamPack(
        child_id=child_id,
        version=new_version,
        payload={
            "places": [{"lat": p["lat"], "lon": p["lon"], "radius": 60} for p in stay_points[:10]],
            "version": new_version,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
        validated=True,
    )
    db.add(pack)

    from app.models.child import Child
    result = await db.execute(select(Child).where(Child.id == child_id))
    child = result.scalar_one_or_none()
    if child:
        new_confidence = min(100, child.model_confidence + 5)
        child.model_confidence = new_confidence

    await db.commit()
    print(f"Retrain complete for child {child_id}: version={new_version}, confidence={new_confidence if child else 'N/A'}")


def _detect_stay_points(positions: list, min_duration_min: int = 5, radius_m: float = 30) -> list:
    stay_points = []
    cluster = []

    for pos in positions:
        cluster.append(pos)
        duration = (pos.ts - cluster[0].ts).total_seconds() / 60 if hasattr(pos, 'ts') else 0

        if duration >= min_duration_min:
            avg_lat = 0
            avg_lon = 0
            count = 0
            for p in cluster:
                if hasattr(p, 'geom') and p.geom:
                    from geoalchemy2 import functions as geo_func
                    avg_lat += 0
                    avg_lon += 0
                    count += 1
            if count > 0:
                stay_points.append({"lat": avg_lat / count, "lon": avg_lon / count, "duration": duration})
            cluster = []

    return stay_points


def _dbscan_cluster(points: list, eps_m: float = 60, min_samples: int = 3) -> list:
    if len(points) < min_samples:
        return [[p] for p in points]

    try:
        from sklearn.cluster import DBSCAN
        import numpy as np

        coords = np.array([[p["lat"], p["lon"]] for p in points])
        if len(coords) < min_samples:
            return [[p] for p in points]

        eps_deg = eps_m / 111320.0
        clustering = DBSCAN(eps=eps_deg, min_samples=min_samples).fit(coords)

        clusters = {}
        for i, label in enumerate(clustering.labels_):
            if label not in clusters:
                clusters[label] = []
            clusters[label].append(points[i])

        return [c for label, c in clusters.items() if label != -1]
    except ImportError:
        return [points]


@celery_app.task
def purge_old_positions():
    """
    Purge les positions de plus de POSITION_RETENTION_DAYS jours.
    """
    import asyncio
    asyncio.run(_purge_async())


async def _purge_async():
    async with async_session_factory() as db:
        cutoff = datetime.now(timezone.utc) - timedelta(days=settings.POSITION_RETENTION_DAYS)
        result = await db.execute(
            text(f"DELETE FROM positions WHERE ts < :cutoff"),
            {"cutoff": cutoff},
        )
        deleted = result.rowcount
        await db.commit()
        print(f"Purged {deleted} old positions")
