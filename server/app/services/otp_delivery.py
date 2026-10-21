"""
Livraison des codes à usage unique : SMS, WhatsApp ou e-mail.

Chaque canal est un adaptateur configuré UNIQUEMENT par variables
d'environnement (aucun identifiant dans le code). Un canal non configuré est
indisponible : il n'est pas proposé à l'utilisateur et toute tentative répond
503 `channel_unavailable` — jamais de faux « code envoyé ».

- SMS : Twilio (API REST Messages) ou Africa's Talking (API messaging v1).
- WhatsApp : API Cloud de Meta, modèle de type « authentication » approuvé
  (paramètre : le code). Le nom du modèle est fourni par WHATSAPP_TEMPLATE_NAME.
- E-mail : SMTP existant (app/services/email).

Les URL et formats ci-dessous suivent la documentation publique des
fournisseurs ; ils n'ont PAS été testés contre les services réels (aucun compte
fourni) — voir docs/TACHES_DIFFEREES.md (T-OTP-PROVIDERS).
Le code n'est jamais journalisé.
"""
import logging
from dataclasses import dataclass
from typing import Callable, Optional

import httpx

from app.core.config import settings
from app.core.phone import mask_phone
from app.services.email import EmailDeliveryFailed, EmailUnavailable, email_available, render, send_email

logger = logging.getLogger("siren.otp")

CHANNELS = ("sms", "whatsapp", "email")


class DeliveryUnavailable(Exception):
    """Canal non configuré."""


class DeliveryFailed(Exception):
    """Le fournisseur a refusé ou n'a pas répondu."""


@dataclass(frozen=True)
class OtpMessage:
    code: str
    minutes: int
    language: str
    purpose: str
    name: str


SMS_TEXT = {
    "fr": "SIREN : votre code est {code}. Valable {minutes} min. Ne le communiquez à personne.",
    "en": "SIREN: your code is {code}. Valid for {minutes} min. Never share it.",
}


def sms_text(message: OtpMessage) -> str:
    return SMS_TEXT.get(message.language, SMS_TEXT["fr"]).format(code=message.code, minutes=message.minutes)


# Adaptateur de test : remplacé par les tests uniquement (jamais activé par configuration).
# Reçoit (canal, destination, OtpMessage | texte d'avis).
_test_sender: Optional[Callable[[str, str, "OtpMessage | str"], None]] = None


def set_test_sender(sender: Optional[Callable[[str, str, "OtpMessage | str"], None]]) -> None:
    """Réservé aux tests : capture les envois au lieu d'appeler un fournisseur."""
    global _test_sender
    _test_sender = sender


def sms_available() -> bool:
    if settings.SMS_PROVIDER == "twilio":
        return bool(settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM)
    if settings.SMS_PROVIDER == "africastalking":
        return bool(settings.AFRICASTALKING_USERNAME and settings.AFRICASTALKING_API_KEY)
    return False


def whatsapp_available() -> bool:
    return bool(settings.WHATSAPP_PHONE_NUMBER_ID and settings.WHATSAPP_ACCESS_TOKEN and settings.WHATSAPP_TEMPLATE_NAME)


def channel_available(channel: str) -> bool:
    if _test_sender is not None:
        return channel in CHANNELS
    return {"sms": sms_available, "whatsapp": whatsapp_available, "email": email_available}.get(channel, lambda: False)()


def available_channels() -> list[str]:
    return [c for c in CHANNELS if channel_available(c)]


async def deliver(channel: str, destination: str, message: OtpMessage) -> None:
    if _test_sender is not None:
        _test_sender(channel, destination, message)
        return
    if not channel_available(channel):
        raise DeliveryUnavailable(channel)
    try:
        if channel == "sms":
            await _send_sms(destination, sms_text(message))
        elif channel == "whatsapp":
            await _send_whatsapp(destination, message)
        else:
            template = {"login_2fa": "login_2fa", "password_reset": "password_reset"}.get(message.purpose, "signup_verify")
            await send_email(destination, render(template, message.language, {"name": message.name, "code": message.code, "minutes": message.minutes}))
    except (EmailUnavailable,) as error:
        raise DeliveryUnavailable(channel) from error
    except (EmailDeliveryFailed, httpx.HTTPError) as error:
        logger.warning("Échec d'envoi du code par %s vers %s : %s", channel, _masked(channel, destination), type(error).__name__)
        raise DeliveryFailed(channel) from error
    logger.info("Code envoyé par %s vers %s", channel, _masked(channel, destination))


async def send_sms_notice(destination: str, text: str) -> None:
    """Avis de sécurité par SMS (sans code). Mêmes adaptateurs et mêmes erreurs que `deliver`."""
    if _test_sender is not None:
        _test_sender("sms", destination, text)
        return
    if not sms_available():
        raise DeliveryUnavailable("sms")
    try:
        await _send_sms(destination, text)
    except httpx.HTTPError as error:
        raise DeliveryFailed("sms") from error


def _masked(channel: str, destination: str) -> str:
    if channel == "email":
        from app.services.email import mask_email

        return mask_email(destination)
    return mask_phone(destination)


async def _send_sms(to_e164: str, text: str) -> None:
    async with httpx.AsyncClient(timeout=settings.OTP_HTTP_TIMEOUT_S) as client:
        if settings.SMS_PROVIDER == "twilio":
            response = await client.post(
                f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Messages.json",
                data={"To": to_e164, "From": settings.TWILIO_FROM, "Body": text},
                auth=(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN),
            )
        else:  # africastalking
            payload = {"username": settings.AFRICASTALKING_USERNAME, "to": to_e164, "message": text}
            if settings.AFRICASTALKING_SENDER_ID:
                payload["from"] = settings.AFRICASTALKING_SENDER_ID
            response = await client.post(
                "https://api.africastalking.com/version1/messaging",
                data=payload,
                headers={"apiKey": settings.AFRICASTALKING_API_KEY, "Accept": "application/json"},
            )
        response.raise_for_status()


async def _send_whatsapp(to_e164: str, message: OtpMessage) -> None:
    # Modèle « authentication » : le code est le paramètre du corps ET du bouton « copier le code ».
    language = "fr" if message.language == "fr" else "en"
    body = {
        "messaging_product": "whatsapp",
        "to": to_e164.lstrip("+"),
        "type": "template",
        "template": {
            "name": settings.WHATSAPP_TEMPLATE_NAME,
            "language": {"code": language},
            "components": [
                {"type": "body", "parameters": [{"type": "text", "text": message.code}]},
                {"type": "button", "sub_type": "url", "index": "0", "parameters": [{"type": "text", "text": message.code}]},
            ],
        },
    }
    async with httpx.AsyncClient(timeout=settings.OTP_HTTP_TIMEOUT_S) as client:
        response = await client.post(
            f"https://graph.facebook.com/{settings.WHATSAPP_GRAPH_VERSION}/{settings.WHATSAPP_PHONE_NUMBER_ID}/messages",
            json=body,
            headers={"Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN}"},
        )
        response.raise_for_status()
