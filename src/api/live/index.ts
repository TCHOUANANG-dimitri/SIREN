import i18n from '@/i18n';
import { logger } from '@/utils/logger';
import type { SirenApi } from '../repositories';
import { http, seg } from '../http/client';
import {
  alertSchema,
  audioLogSchema,
  auditEntrySchema,
  authResponseSchema,
  childSchema,
  communityReportSchema,
  deviceLookupSchema,
  deviceSettingsSchema,
  deviceStatusSchema,
  emergencyContactSchema,
  geofenceSchema,
  parseContract,
  parseContractList,
  permissionsSchema,
  placeSchema,
  positionSchema,
  refreshResponseSchema,
  riskHistorySchema,
  riskScoreSchema,
  searchZoneSchema,
  shareSchema,
  userSchema,
  zoneStateSchema,
} from '../contracts';

/**
 * Implémentation HTTP du contrat `SirenApi` sur les routes `server/app/api/v1`.
 * Chaque réponse passe par `contracts` avant d'atteindre l'UI.
 */

const warnInvalid = (endpoint: string) => (index: number) =>
  logger.warn('Élément ignoré : non conforme au contrat', { endpoint, index });

function list<S extends Parameters<typeof parseContractList>[0]>(schema: S, data: unknown, endpoint: string) {
  return parseContractList(schema, data, endpoint, warnInvalid(endpoint));
}

const children = (childId: string) => `/children/${seg(childId)}`;

export const liveApi: SirenApi = {
  mode: 'live',

  auth: {
    async register(input) {
      const data = await http.post('/auth/register', input, {
        skipAuth: true,
        messages: { conflict: i18n.t('errors.emailAlreadyUsed') },
      });
      const parsed = parseContract(authResponseSchema, data, 'POST /auth/register');
      return { user: parsed.user, accessToken: parsed.accessToken, refreshToken: parsed.refreshToken };
    },
    async login(input) {
      const data = await http.post('/auth/login', input, {
        skipAuth: true,
        messages: { unauthorized: i18n.t('errors.invalidCredentials') },
      });
      const parsed = parseContract(authResponseSchema, data, 'POST /auth/login');
      return {
        user: parsed.user,
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
        twofaRequired: parsed.twofaRequired === true,
      };
    },
    async refresh(refreshToken) {
      const data = await http.post('/auth/refresh', { refreshToken }, { skipAuth: true });
      return parseContract(refreshResponseSchema, data, 'POST /auth/refresh');
    },
    async requestOtp({ destination }) {
      // Le serveur v1 peut renvoyer un `devHint` de développement : il n'est jamais affiché en live.
      const data = await http.post<{ required?: unknown }>('/auth/request-otp', { destination }, { skipAuth: true });
      return { required: data?.required !== false };
    },
    async verifyOtp({ code, accessToken }) {
      await http.post('/auth/verify-otp', { code, accessToken }, {
        skipAuth: true,
        messages: { unauthorized: i18n.t('errors.otpInvalid') },
      });
    },
    async forgotPassword(email) {
      await http.post('/auth/forgot', { email }, { skipAuth: true });
    },
    async logout(refreshToken) {
      await http.post('/auth/logout', { refreshToken }, { skipAuth: true });
    },
  },

  users: {
    async patchMe(patch) {
      return parseContract(userSchema, await http.patch('/users/me', patch), 'PATCH /users/me');
    },
    async deleteMe() {
      await http.delete('/users/me');
    },
    async registerPushToken(input) {
      await http.post('/users/me/push-token', input);
    },
  },

  children: {
    async list() {
      return list(childSchema, await http.get('/children'), 'GET /children');
    },
    async create(input) {
      const data = await http.post('/children', input, {
        messages: { not_found: i18n.t('errors.deviceNotFound'), conflict: i18n.t('errors.deviceNotFound') },
      });
      return parseContract(childSchema, data, 'POST /children');
    },
    async getStatus(childId) {
      const data = await http.get(`${children(childId)}/status`, {
        messages: { not_found: i18n.t('errors.deviceMissing') },
      });
      return parseContract(deviceStatusSchema, data, 'GET /children/{id}/status');
    },
    async patchContext(childId, patch) {
      return parseContract(childSchema, await http.patch(children(childId), patch), 'PATCH /children/{id}');
    },
    async findDevice(deviceId) {
      const data = await http.get(`/children/devices/${seg(deviceId.trim().toUpperCase())}`, {
        messages: { not_found: i18n.t('errors.deviceNotFound') },
      });
      const parsed = parseContract(deviceLookupSchema, data, 'GET /children/devices/{id}');
      return { deviceId: parsed.deviceId, online: parsed.online, battery: parsed.battery };
    },
  },

  tracking: {
    async getPosition(childId) {
      const data = await http.get(`${children(childId)}/position`);
      // 204 / corps vide : aucune position reçue du dispositif à ce jour.
      if (data === '' || data == null) return null;
      return parseContract(positionSchema, data, 'GET /children/{id}/position');
    },
    async requestFix(childId) {
      await http.post(`${children(childId)}/position/fix`);
    },
    async getZoneState(childId) {
      return parseContract(zoneStateSchema, await http.get(`${children(childId)}/zone-state`), 'GET /children/{id}/zone-state');
    },
    async getHistory(childId, from, to) {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const query = params.toString();
      const data = await http.get(`${children(childId)}/history${query ? `?${query}` : ''}`);
      // Le serveur renvoie du plus récent au plus ancien ; l'UI attend l'ordre chronologique.
      return list(positionSchema, data, 'GET /children/{id}/history').sort((a, b) =>
        a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0
      );
    },
  },

  places: {
    async list(childId) {
      return list(placeSchema, await http.get(`${children(childId)}/places`), 'GET /children/{id}/places');
    },
    async create(childId, input) {
      const { schedule, ...rest } = input;
      // v1 serveur : un seul créneau par lieu à la création.
      const body = { ...rest, schedule: schedule?.[0] };
      return parseContract(placeSchema, await http.post(`${children(childId)}/places`, body), 'POST /children/{id}/places');
    },
    async patch(placeId, patch) {
      return parseContract(placeSchema, await http.patch(`/children/places/${seg(placeId)}`, patch), 'PATCH /children/places/{id}');
    },
  },

  geofences: {
    async list(childId) {
      return list(geofenceSchema, await http.get(`${children(childId)}/geofences`), 'GET /children/{id}/geofences');
    },
    async create(childId, input) {
      return parseContract(geofenceSchema, await http.post(`${children(childId)}/geofences`, input), 'POST /children/{id}/geofences');
    },
    async patch(geofenceId, patch) {
      return parseContract(
        geofenceSchema,
        await http.patch(`/children/geofences/${seg(geofenceId)}`, patch),
        'PATCH /children/geofences/{id}'
      );
    },
    async remove(geofenceId) {
      await http.delete(`/children/geofences/${seg(geofenceId)}`);
    },
  },

  risk: {
    async get(childId) {
      return parseContract(riskScoreSchema, await http.get(`${children(childId)}/risk`), 'GET /children/{id}/risk');
    },
    async history(childId) {
      return parseContract(riskHistorySchema, await http.get(`${children(childId)}/risk/history`), 'GET /children/{id}/risk/history');
    },
  },

  alerts: {
    async listForChild(childId) {
      return list(alertSchema, await http.get(`${children(childId)}/alerts`), 'GET /children/{id}/alerts');
    },
    async listAll() {
      return list(alertSchema, await http.get('/children/alerts'), 'GET /children/alerts');
    },
    async patch(alertId, status) {
      return parseContract(alertSchema, await http.patch(`/children/alerts/${seg(alertId)}`, { status }), 'PATCH /children/alerts/{id}');
    },
  },

  sharing: {
    async list(childId) {
      return list(shareSchema, await http.get(`${children(childId)}/shares`), 'GET /children/{id}/shares');
    },
    async create(childId, input) {
      const data = await http.post(`${children(childId)}/shares`, input, {
        messages: { conflict: i18n.t('errors.alreadyInvitedOrLimit'), not_found: i18n.t('errors.inviteeNotFound') },
      });
      return parseContract(shareSchema, data, 'POST /children/{id}/shares');
    },
    async get(shareId) {
      return parseContract(shareSchema, await http.get(`/children/shares/${seg(shareId)}`), 'GET /children/shares/{id}');
    },
    async patch(shareId, patch) {
      const data = await http.patch(`/children/shares/${seg(shareId)}`, patch, {
        messages: { conflict: i18n.t('errors.alreadyInvitedOrLimit') },
      });
      return parseContract(shareSchema, data, 'PATCH /children/shares/{id}');
    },
    async myPermissions(childId) {
      return parseContract(permissionsSchema, await http.get(`${children(childId)}/permissions`), 'GET /children/{id}/permissions');
    },
    async audit(childId) {
      return list(auditEntrySchema, await http.get(`${children(childId)}/shares/audit`), 'GET /children/{id}/shares/audit');
    },
  },

  community: {
    async list() {
      return list(communityReportSchema, await http.get('/community/reports'), 'GET /community/reports');
    },
    async create(input) {
      const report = parseContract(communityReportSchema, await http.post('/community/reports', input), 'POST /community/reports');
      if (!report) throw new Error('Signalement créé sans position');
      return report;
    },
  },

  searchZone: {
    async get(childId) {
      return parseContract(searchZoneSchema, await http.get(`${children(childId)}/search-zone`), 'GET /children/{id}/search-zone');
    },
    async declareDisappearance(childId) {
      await http.post(`${children(childId)}/disappearance`);
    },
  },

  emergencyContacts: {
    async list(childId) {
      return list(emergencyContactSchema, await http.get(`${children(childId)}/emergency-contacts`), 'GET /children/{id}/emergency-contacts');
    },
    async create(childId, input) {
      return parseContract(
        emergencyContactSchema,
        await http.post(`${children(childId)}/emergency-contacts`, input),
        'POST /children/{id}/emergency-contacts'
      );
    },
  },

  audio: {
    async activate(childId, input) {
      const data = await http.post(`${children(childId)}/audio/activate`, input, {
        messages: { forbidden: i18n.t('errors.audioConditions') },
      });
      return parseContract(audioLogSchema, data, 'POST /children/{id}/audio/activate');
    },
    async logs(childId) {
      return list(audioLogSchema, await http.get(`${children(childId)}/audio/logs`), 'GET /children/{id}/audio/logs');
    },
  },

  device: {
    async getSettings(childId) {
      return parseContract(deviceSettingsSchema, await http.get(`${children(childId)}/device/settings`), 'GET /children/{id}/device/settings');
    },
    async patchSettings(childId, patch) {
      return parseContract(
        deviceSettingsSchema,
        await http.patch(`${children(childId)}/device/settings`, patch),
        'PATCH /children/{id}/device/settings'
      );
    },
  },
};
