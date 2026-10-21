"""
Emails d'alerte de sécurité (mot de passe changé, 2FA activée/désactivée).
Envoi « au mieux » : un échec d'email ne doit pas annuler l'action de sécurité
elle-même, mais il est journalisé (sans l'adresse complète).
"""
import logging

from app.services.email import EmailDeliveryFailed, EmailUnavailable, mask_email, render, send_email

logger = logging.getLogger("siren.security")


async def _send(user, template: str, variables: dict) -> bool:
    try:
        await send_email(user.email, render(template, user.langue or "fr", {"name": user.nom, **variables}))
        return True
    except EmailUnavailable:
        logger.info("Alerte de sécurité %s non envoyée (aucun canal email)", template)
    except EmailDeliveryFailed:
        logger.warning("Alerte de sécurité %s non délivrée à %s", template, mask_email(user.email))
    return False


async def notify_password_changed(user) -> bool:
    return await _send(user, "password_changed", {})


async def notify_twofa_changed(user, enabled: bool) -> bool:
    return await _send(user, "twofa_changed", {"state": "enabled" if enabled else "disabled"})


async def notify_phone_changed(user, previous_phone: str | None) -> bool:
    """
    Prévient l'ANCIEN numéro par SMS si un fournisseur est configuré. Ne contient
    jamais le nouveau numéro en entier. Échec toléré (le changement est déjà
    prouvé par le code), mais journalisé.
    """
    from app.core.phone import mask_phone
    from app.services.otp_delivery import DeliveryFailed, DeliveryUnavailable, channel_available, send_sms_notice

    if not previous_phone or not channel_available("sms"):
        return False
    text = {
        "fr": f"SIREN : le numéro de votre compte a été remplacé par {mask_phone(user.telephone)}. Si ce n'est pas vous, contactez le support.",
        "en": f"SIREN: your account phone number was changed to {mask_phone(user.telephone)}. If this wasn't you, contact support.",
    }.get(user.langue or "fr")
    try:
        await send_sms_notice(previous_phone, text)
    except (DeliveryFailed, DeliveryUnavailable) as error:
        logger.warning("Ancien numéro non prévenu : %s", type(error).__name__)
        return False
    return True
