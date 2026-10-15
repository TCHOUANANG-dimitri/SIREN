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
