"""
Couche 1 — Règles déclaratives (zones et horaires définis par le parent).

Implémente la spécification validée en semaine 1 (tâche "Définir les règles
déclaratives"). Voir le livrable complet :
Documentation/IA_S1_Schema_Regles_Declaratives.md

Pure Python, sans dépendance à SQLAlchemy ni à PostGIS : les règles sont
passées en paramètre sous forme de structures simples (dataclasses), pour
rester testable hors ligne et indépendante du choix de stockage — ce choix
relève désormais de l'équipe infrastructure, plus de l'équipe IA.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, time, tzinfo
from typing import List, Optional
from zoneinfo import ZoneInfo

from app.rules.geo import Point, distance_m

# --- Constantes de la spécification (semaine 1) ---------------------------

# Fuseau horaire fixe pour évaluer les horaires des lieux (zone d'usage :
# Douala et environs, cf. CDC §9). À revoir si le service s'étend un jour.
TIMEZONE: tzinfo = ZoneInfo("Africa/Douala")

MAX_GEOFENCES_PER_CHILD = 20
MAX_PLACES_PER_CHILD = 20

# Rayon utilisé pour un lieu quand le parent ne le précise pas.
DEFAULT_PLACE_RADIUS_M = 100.0

# Sous-scores (0-1), avant pondération dans la fusion globale (CDC §5.4).
SCORE_ZONE_INTERDITE = 0.8
SCORE_HORS_PERIMETRE = 0.6
SCORE_HORS_HORAIRE = 0.3

# Marge GPS (m) ajoutée aux rayons pour éviter les faux positifs à la frontière.
GPS_MARGIN_M = 30.0


# --- Structures de données -------------------------------------------------


@dataclass
class Geofence:
    """Périmètre défini par le parent. Cercle uniquement (spécification S1)."""

    id: str
    type: str  # "autorise" | "interdit"
    center: Point
    radius_m: float


@dataclass
class PlaceSchedule:
    """Horaire attendu pour un lieu. jours: 0=lundi ... 6=dimanche (ISO)."""

    jours: List[int]
    heure_debut: time
    heure_fin: time


@dataclass
class Place:
    """Lieu déclaré par le parent (couche 1). Les lieux 'appris' (couche 3,
    source='appris') ne passent pas par ce module."""

    id: str
    center: Point
    radius_m: float = DEFAULT_PLACE_RADIUS_M
    schedules: List[PlaceSchedule] = field(default_factory=list)


@dataclass
class DeclarativeResult:
    score: float
    reasons: List[str]


# --- Évaluation --------------------------------------------------------


def evaluate_declarative(
    geofences: List[Geofence],
    places: List[Place],
    position: Point,
    now: Optional[datetime] = None,
) -> DeclarativeResult:
    """
    Calcule le sous-score déclaratif (couche 1), entre 0 et 1.

    Règles (spécification validée semaine 1 + périmètre de vie validé) :

    1. Une geofence de type "interdit" qui contient la position -> 0.8.
       Une interdiction prime TOUJOURS, même si une zone "autorise" plus
       large engloberait le même point (règle de prudence).
    2. Sortie du périmètre de vie : si au moins un périmètre "autorise"
       existe et que la position est en dehors de TOUS les périmètres
       autorisés (marge GPS incluse) -> 0.6. Être dans un lieu attendu
       dont l'horaire gouverne ce moment annule ce signal (cas école
       hors quartier). Sans aucun périmètre autorisé -> neutre.
    3. Hors de l'horaire attendu, pour un lieu dont un horaire est ACTIF
       au moment considéré -> 0.3. Un lieu sans aucun horaire déclaré est
       considéré valide 24h/24 : il ne déclenche jamais ce signal.
    4. Si aucune règle ne s'applique (pas de zone interdite franchie, pas
       de sortie périmètre, pas de lieu dont l'horaire est actif
       maintenant) -> 0.0 (neutre : on ne pénalise pas une famille qui
       n'a pas encore tout configuré).
    5. Si plusieurs signaux sont vrais en même temps, on garde le MAXIMUM
       (pas de cumul additif) — cohérent avec le moteur de fusion global
       (app/services/fusion_score.py), qui gère déjà la concordance entre
       familles de signaux à son propre niveau.
    """
    if now is None:
        now = datetime.now(TIMEZONE)
    else:
        now = now.astimezone(TIMEZONE)

    # --- 1. Zones interdites (priorité absolue) ---
    interdictions = [
        gf.id
        for gf in geofences
        if gf.type == "interdit" and distance_m(position, gf.center) <= gf.radius_m + GPS_MARGIN_M
    ]
    if interdictions:
        return DeclarativeResult(
            score=SCORE_ZONE_INTERDITE,
            reasons=[f"zone_interdite:{gf_id}" for gf_id in interdictions],
        )

    # --- 2. Horaires attendus par lieu (calculé avant le périmètre pour
    # permettre au bon lieu d'annuler la sortie périmètre) ---
    current_dow = now.weekday()
    current_time = now.time()

    governs_now = False
    inside_an_expected_place = False

    for place in places:
        if not place.schedules:
            continue  # lieu sans horaire : toujours valide, ne gouverne jamais

        for sched in place.schedules:
            if current_dow not in sched.jours:
                continue
            if not (sched.heure_debut <= current_time <= sched.heure_fin):
                continue
            governs_now = True
            if distance_m(position, place.center) <= place.radius_m + GPS_MARGIN_M:
                inside_an_expected_place = True

    # --- 3. Sortie du périmètre de vie ---
    perimetres = [gf for gf in geofences if gf.type == "autorise"]
    if perimetres:
        inside_perimetre = any(
            distance_m(position, gf.center) <= gf.radius_m + GPS_MARGIN_M
            for gf in perimetres
        )
        if not inside_perimetre and not (governs_now and inside_an_expected_place):
            outside_ids = ",".join(gf.id for gf in perimetres)
            return DeclarativeResult(
                score=SCORE_HORS_PERIMETRE,
                reasons=[f"hors_perimetre:{outside_ids}"],
            )

    # --- 4. Hors horaire ---
    if governs_now and not inside_an_expected_place:
        return DeclarativeResult(score=SCORE_HORS_HORAIRE, reasons=["hors_horaire_attendu"])

    # --- 5. Aucune règle applicable ---
    return DeclarativeResult(score=0.0, reasons=[])
