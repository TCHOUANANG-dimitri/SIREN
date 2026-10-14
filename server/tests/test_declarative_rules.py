"""
Tests de la couche 1 (règles déclaratives) — app/rules/declarative.py

Lance avec : pytest tests/test_declarative_rules.py -v
"""
from datetime import datetime

from app.rules.declarative import (
    SCORE_HORS_HORAIRE,
    SCORE_HORS_PERIMETRE,
    SCORE_ZONE_INTERDITE,
    Geofence,
    Place,
    PlaceSchedule,
    TIMEZONE,
    evaluate_declarative,
)
from app.rules.geo import Point

ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]


def _dt(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 10, 12, hour, minute, tzinfo=TIMEZONE)


def test_zone_interdite_declenche():
    gf = Geofence(id="g1", type="interdit", center=Point(4.05, 9.70), radius_m=200)
    pos = Point(4.0501, 9.7001)  # quelques mètres du centre, dans le rayon
    result = evaluate_declarative([gf], [], pos, now=_dt(10))
    assert result.score == SCORE_ZONE_INTERDITE
    assert result.reasons == ["zone_interdite:g1"]


def test_zone_autorisee_ne_declenche_rien():
    gf = Geofence(id="g1", type="autorise", center=Point(4.05, 9.70), radius_m=200)
    pos = Point(4.0501, 9.7001)
    result = evaluate_declarative([gf], [], pos, now=_dt(10))
    assert result.score == 0.0


def test_zone_interdite_hors_de_portee_ne_declenche_rien():
    gf = Geofence(id="g1", type="interdit", center=Point(4.05, 9.70), radius_m=50)
    loin = Point(5.0, 10.0)
    result = evaluate_declarative([gf], [], loin, now=_dt(10))
    assert result.score == 0.0


def test_hors_horaire_attendu():
    ecole = Place(
        id="p1",
        center=Point(4.05, 9.70),
        radius_m=100,
        schedules=[PlaceSchedule(jours=ALL_DAYS, heure_debut=_dt(8).time(), heure_fin=_dt(15).time())],
    )
    ailleurs = Point(4.10, 9.80)
    result = evaluate_declarative([], [ecole], ailleurs, now=_dt(10))
    assert result.score == SCORE_HORS_HORAIRE
    assert result.reasons == ["hors_horaire_attendu"]


def test_dans_horaire_et_au_bon_lieu_ne_declenche_rien():
    ecole = Place(
        id="p1",
        center=Point(4.05, 9.70),
        radius_m=100,
        schedules=[PlaceSchedule(jours=ALL_DAYS, heure_debut=_dt(8).time(), heure_fin=_dt(15).time())],
    )
    a_lecole = Point(4.0501, 9.7001)
    result = evaluate_declarative([], [ecole], a_lecole, now=_dt(10))
    assert result.score == 0.0


def test_hors_creneau_horaire_ne_declenche_rien():
    # Même lieu, mais on est hors du créneau 8h-15h : pas de signal, même
    # si l'enfant n'est pas à l'école (le créneau ne "gouverne" pas 20h).
    ecole = Place(
        id="p1",
        center=Point(4.05, 9.70),
        radius_m=100,
        schedules=[PlaceSchedule(jours=ALL_DAYS, heure_debut=_dt(8).time(), heure_fin=_dt(15).time())],
    )
    ailleurs = Point(4.10, 9.80)
    result = evaluate_declarative([], [ecole], ailleurs, now=_dt(20))
    assert result.score == 0.0


def test_lieu_sans_horaire_est_toujours_valide():
    maison = Place(id="p1", center=Point(4.05, 9.70), radius_m=100, schedules=[])
    ailleurs = Point(5.0, 10.0)
    result = evaluate_declarative([], [maison], ailleurs, now=_dt(23))
    assert result.score == 0.0


def test_interdiction_prime_sur_horaire_respecte():
    gf = Geofence(id="g1", type="interdit", center=Point(4.05, 9.70), radius_m=500)
    ecole = Place(
        id="p1",
        center=Point(4.05, 9.70),
        radius_m=100,
        schedules=[PlaceSchedule(jours=ALL_DAYS, heure_debut=_dt(8).time(), heure_fin=_dt(15).time())],
    )
    pos = Point(4.0501, 9.7001)  # dans la zone interdite ET à l'école
    result = evaluate_declarative([gf], [ecole], pos, now=_dt(10))
    assert result.score == SCORE_ZONE_INTERDITE


def test_aucune_regle_est_neutre():
    result = evaluate_declarative([], [], Point(4.05, 9.70), now=_dt(3))
    assert result.score == 0.0
    assert result.reasons == []


def test_sortie_perimetre_declenche():
    perimetre = Geofence(id="home", type="autorise", center=Point(4.05, 9.70), radius_m=1500)
    loin = Point(4.20, 9.90)  # plusieurs km, hors périmètre + marge
    result = evaluate_declarative([perimetre], [], loin, now=_dt(10))
    assert result.score == SCORE_HORS_PERIMETRE
    assert any("hors_perimetre" in r for r in result.reasons)


def test_dans_perimetre_ne_declenche_rien():
    perimetre = Geofence(id="home", type="autorise", center=Point(4.05, 9.70), radius_m=1500)
    dedans = Point(4.0501, 9.7001)
    result = evaluate_declarative([perimetre], [], dedans, now=_dt(10))
    assert result.score == 0.0


def test_sans_perimetre_sortie_lointaine_reste_neutre():
    loin = Point(5.0, 10.0)
    result = evaluate_declarative([], [], loin, now=_dt(10))
    assert result.score == 0.0


def test_bon_lieu_annule_sortie_perimetre():
    perimetre = Geofence(id="home", type="autorise", center=Point(4.05, 9.70), radius_m=500)
    ecole_loin = Place(
        id="ecole",
        center=Point(4.10, 9.80),
        radius_m=150,
        schedules=[PlaceSchedule(jours=ALL_DAYS, heure_debut=_dt(8).time(), heure_fin=_dt(15).time())],
    )
    a_lecole = Point(4.1001, 9.8001)  # hors périmètre mais au bon lieu à la bonne heure
    result = evaluate_declarative([perimetre], [ecole_loin], a_lecole, now=_dt(10))
    assert result.score == 0.0


def test_interdiction_prime_sur_sortie_perimetre():
    perimetre = Geofence(id="home", type="autorise", center=Point(4.05, 9.70), radius_m=1500)
    interdite = Geofence(id="g1", type="interdit", center=Point(4.0505, 9.7005), radius_m=200)
    pos = Point(4.0506, 9.7006)  # dans les deux à la fois
    result = evaluate_declarative([perimetre, interdite], [], pos, now=_dt(10))
    assert result.score == SCORE_ZONE_INTERDITE
