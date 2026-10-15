"""
Fonction de distance partagée entre les modules de règles.

Propriété logique de la tâche "Définir le calcul de la distance"
(Semaine 1, tâche 2 du calendrier IA — en charge de ta collaboratrice).

Implémentation TEMPORAIRE (Haversine, méthode standard pour une distance
à vol d'oiseau sur une sphère) fournie ici pour que les règles déclaratives
(tâche 3) et les seuils universels (tâche 4) soient testables dès
maintenant, sans attendre le livrable officiel de la tâche 2.

Dès que la note technique de la tâche 2 est validée en équipe :
- si la formule choisie est différente (ex. ellipsoïde WGS84 au lieu
  d'une sphère), remplacer le corps de `distance_m` ;
- la signature `distance_m(a: Point, b: Point) -> float` (mètres) ne doit
  pas changer, pour ne pas casser `declarative.py` ni `universal.py`.
"""
from __future__ import annotations

from dataclasses import dataclass
from math import asin, cos, radians, sin, sqrt

# Rayon moyen de la Terre, en mètres (valeur standard utilisée par Haversine).
EARTH_RADIUS_M = 6_371_000.0


@dataclass(frozen=True)
class Point:
    lat: float
    lon: float


def distance_m(a: Point, b: Point) -> float:
    """Distance à vol d'oiseau entre deux points (formule de Haversine), en mètres."""
    lat1, lon1, lat2, lon2 = map(radians, (a.lat, a.lon, b.lat, b.lon))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_M * asin(sqrt(h))
