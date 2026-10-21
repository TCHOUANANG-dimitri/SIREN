"""Protocole traceur (docs/transition-données-serveur.pdf §7) : trames, événements, signatures."""
import pytest

from app.services import device_protocol as dp

DOC_FRAME = "FCN-0733;4.036000;9.762200;85;12.5;2026-09-21T10:00:00Z;;;;8;72;214.9"
DOC_EVENT = "FCN-0733;4.036000;9.762200;85;12.5;2026-09-21T10:00:00Z;1;4.5;18.0;8;72;214.9"


def test_doc_frame_is_parsed_by_position():
    f = dp.parse_frame(DOC_FRAME)
    assert (f.tracker_id, f.lat, f.lon, f.battery, f.speed_kmh) == ("FCN-0733", 4.036, 9.7622, 85, 12.5)
    assert f.ts.isoformat() == "2026-09-21T10:00:00+00:00"
    assert (f.satellites, f.signal_pct, f.heading) == (8, 72, 214.9)
    assert f.event is None


def test_event_fields_are_mapped():
    f = dp.parse_frame(DOC_EVENT)
    assert f.event == {"name": "detachment", "stored": "arrachement"}
    assert (f.event_value, f.event_threshold) == (4.5, 18.0)


def test_optional_fields_may_be_empty():
    f = dp.parse_frame("SIREN-ab12C-XY9z0;4.0;9.7;;;2026-09-21T10:00:00Z;;;;;;")
    assert f.battery is None and f.speed_kmh is None and f.heading is None
    assert f.tracker_id == "SIREN-ab12C-XY9z0"  # casse conservée


@pytest.mark.parametrize(
    "frame, reason",
    [
        ("a;b", "field_count"),
        (DOC_FRAME + ";extra", "field_count"),
        (DOC_FRAME.replace("4.036000", "91"), "lat_invalid"),
        (DOC_FRAME.replace("9.762200", "-181"), "lon_invalid"),
        (DOC_FRAME.replace(";85;", ";101;"), "bat_invalid"),
        (DOC_FRAME.replace(";12.5;", ";161;"), "spd_invalid"),
        (DOC_FRAME.replace("2026-09-21T10:00:00Z", "2026-09-21T10:00:00"), "ts_invalid"),
        (DOC_FRAME.replace("2026-09-21T10:00:00Z", "hier"), "ts_invalid"),
        (DOC_EVENT.replace(";1;4.5", ";9;4.5"), "evt_unknown"),
        (DOC_FRAME.replace(";72;", ";120;"), "sig_invalid"),
        (DOC_FRAME.replace("4.036000", "nan"), "lat_invalid"),
        (";" * 11, "id_invalid"),
        ("x" * 600, "frame_length"),
    ],
)
def test_invalid_frames_are_refused_with_a_stable_reason(frame, reason):
    with pytest.raises(dp.FrameError) as exc:
        dp.parse_frame(frame)
    assert exc.value.reason == reason


def test_command_signature_follows_the_protocol():
    import hashlib
    import hmac

    key = "k" * 32
    msg = dp.build_command(key, "cmd-1", "MODE", "WORK")
    assert msg["sig"] == hmac.new(key.encode(), b"MODE|WORK", hashlib.sha256).hexdigest()
    assert dp.build_command(key, "cmd-2", "LOCALISER", None)["sig"] == hmac.new(key.encode(), b"LOCALISER", hashlib.sha256).hexdigest()
    with pytest.raises(ValueError):
        dp.sign_command("", "LOCALISER", None)


def test_ack_signature_is_verified():
    key = "k" * 32
    sig = dp.sign_ack(key, True, "localisation en cours")
    assert dp.verify_ack(key, True, "localisation en cours", sig)
    assert not dp.verify_ack(key, False, "localisation en cours", sig)  # ok falsifié
    assert not dp.verify_ack(key, True, "autre", sig)
    assert not dp.verify_ack("", True, "localisation en cours", sig)  # sans clé : toujours refusé


@pytest.mark.parametrize(
    "cmd, valeur, reason",
    [("LOCALISER", None, None), ("MODE", "WORK", None), ("MODE", "TURBO", "command_value_invalid"),
     ("REDEMARRER", "x", "command_value_invalid"), ("RESET_USINE", None, "command_unknown"), ("NUMERO_SMS", "+237690000000", "command_unknown")],
)
def test_command_validation(cmd, valeur, reason):
    assert dp.validate_command(cmd, valeur) == reason


def test_fingerprint_is_stable():
    assert dp.frame_fingerprint(DOC_FRAME) == dp.frame_fingerprint(DOC_FRAME + "\n")
    assert dp.frame_fingerprint(DOC_FRAME) != dp.frame_fingerprint(DOC_EVENT)
