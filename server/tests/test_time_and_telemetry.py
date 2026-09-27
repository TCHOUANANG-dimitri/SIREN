from datetime import datetime, timezone

from app.core.geo import point_lat_lon
from app.core.timeutils import app_weekday, in_schedule, parse_iso_utc
from app.services.telemetry import fix_quality_for, should_raise_alert, should_rescore, triage_batch

import struct
import pytest

UTC = timezone.utc


def test_app_weekday_uses_sunday_zero():
    assert app_weekday(datetime(2026, 9, 27)) == 0  # dimanche
    assert app_weekday(datetime(2026, 9, 28)) == 1  # lundi


def test_school_schedule_is_evaluated_in_local_time():
    # Lundi 07:30 UTC = 08:30 à Douala (UTC+1) : dans le créneau 08:00–12:00.
    assert in_schedule([1], "08:00", "12:00", datetime(2026, 9, 28, 7, 30, tzinfo=UTC))
    # Lundi 06:30 UTC = 07:30 locale : hors créneau (l'ancien calcul UTC se trompait d'une heure).
    assert not in_schedule([1], "08:00", "12:00", datetime(2026, 9, 28, 6, 30, tzinfo=UTC))


def test_overnight_sleep_schedule_spans_midnight():
    # Sommeil déclaré le dimanche 21:00 → 06:30 ; lundi 04:00 locale en fait partie.
    assert in_schedule([0], "21:00", "06:30", datetime(2026, 9, 28, 3, 0, tzinfo=UTC))
    assert not in_schedule([0], "21:00", "06:30", datetime(2026, 9, 28, 12, 0, tzinfo=UTC))


def test_timestamps_without_timezone_are_refused():
    with pytest.raises(ValueError):
        parse_iso_utc("2026-09-27T10:00:00")
    assert parse_iso_utc("2026-09-27T10:00:00Z").tzinfo is not None


NOW = datetime(2026, 9, 27, 12, 0, tzinfo=UTC)


def test_batch_triage_duplicates_late_invalid_and_future():
    stored = [datetime(2026, 9, 27, 11, 0, tzinfo=UTC)]
    triage = triage_batch(
        [
            "2026-09-27T11:30:00Z",
            "2026-09-27T11:00:00Z",  # déjà stocké (renvoi GSM)
            "2026-09-27T11:30:00Z",  # doublon dans le lot
            "pas une date",
            "2026-09-27T13:00:00Z",  # futur (horloge dispositif déréglée)
            "2026-09-27T10:45:00Z",  # en retard, accepté pour l'historique
        ],
        stored,
        NOW,
        max_future_skew_s=300,
    )
    assert [p.index for p in triage.accepted] == [5, 0]  # triés par date
    assert triage.duplicates == 2 and triage.rejected == 2


def test_late_batch_does_not_rescore_present():
    assert not should_rescore(datetime(2026, 9, 27, 10, tzinfo=UTC), datetime(2026, 9, 27, 11, tzinfo=UTC))
    assert should_rescore(datetime(2026, 9, 27, 12, tzinfo=UTC), None)


def test_alert_only_on_escalation():
    assert should_raise_alert("veille", "prealerte")
    assert should_raise_alert("prealerte", "urgence")
    assert should_raise_alert(None, "urgence")
    assert not should_raise_alert("prealerte", "prealerte")  # pas une alerte par point
    assert not should_raise_alert("urgence", "prealerte")
    assert not should_raise_alert("prealerte", "veille")


def test_fix_quality_never_claims_recent_without_accuracy():
    assert fix_quality_for(None, 100) == "estimee"
    assert fix_quality_for(250, 100) == "estimee"
    assert fix_quality_for(12, 100) == "gps_recent"


def test_point_decoding_wkt_and_ewkb():
    assert point_lat_lon(type("E", (), {"data": "POINT(11.5167 3.8667)"})()) == (3.8667, 11.5167)
    ewkb = struct.pack("<BII", 1, 0x20000001, 4326) + struct.pack("<dd", 11.5, 3.85)
    assert point_lat_lon(ewkb.hex()) == (3.85, 11.5)
    assert point_lat_lon(None) is None
    assert point_lat_lon("garbage") is None
