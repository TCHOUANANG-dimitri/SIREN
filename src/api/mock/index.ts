import { useAuthStore } from '@/stores/authStore';
import type { SirenApi } from '../repositories';
import { ApiError } from '../errors';
import * as alerts from './services/alertsService';
import * as audio from './services/audioService';
import * as auth from './services/authService';
import * as children from './services/childrenService';
import * as community from './services/communityService';
import * as device from './services/deviceService';
import * as emergencyContacts from './services/emergencyContactsService';
import * as geofences from './services/geofencesService';
import * as places from './services/placesService';
import * as risk from './services/riskService';
import * as searchZone from './services/searchZoneService';
import * as sharing from './services/sharingService';
import * as tracking from './services/trackingService';
import * as users from './services/usersService';

/**
 * Backend simulé exposé sous le contrat `SirenApi`. Réservé au développement
 * et à la démonstration : `config/env` refuse ce mode en production.
 */
const token = () => useAuthStore.getState().accessToken;

async function nullIfNotFound<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export const mockApi: SirenApi = {
  mode: 'mock',
  auth: {
    register: auth.register,
    login: async (input) => ({ ...(await auth.login(input)), twofaRequired: false }),
    refresh: auth.refresh,
    requestOtp: async () => ({ required: true, ...(await auth.requestOtp()) }),
    verifyOtp: ({ code }) => auth.verifyOtp(code),
    forgotPassword: async (email) => {
      await auth.forgotPassword(email);
    },
    logout: async () => {},
  },
  users: {
    patchMe: (patch) => users.patchMe(token(), patch),
    deleteMe: async () => {
      await users.deleteMyAccount(token());
    },
    registerPushToken: async () => {},
  },
  children: {
    list: () => children.listChildren(token()),
    create: (input) => children.createChild(token(), input),
    getStatus: (childId) => children.getChildStatus(token(), childId),
    patchContext: (childId, patch) => children.patchChildContext(token(), childId, patch),
    findDevice: async (deviceId) => {
      const found = await children.findDeviceById(deviceId);
      return { deviceId: found.deviceId, online: found.online, battery: found.battery };
    },
  },
  tracking: {
    getPosition: (childId) => nullIfNotFound(tracking.getPosition(token(), childId)),
    requestFix: async (childId) => {
      await tracking.requestPositionFix(token(), childId);
    },
    getZoneState: async (childId) => {
      const zone = await tracking.getZoneState(token(), childId);
      return { inZone: zone.inZone, zoneName: zone.zoneName, inForbiddenZone: false, asOf: zone.asOf };
    },
    getHistory: (childId, from, to) => tracking.getHistory(token(), childId, from, to),
  },
  places: {
    list: (childId) => places.listPlaces(token(), childId),
    create: (childId, input) => places.createPlace(token(), childId, input),
    patch: (placeId, patch) => places.patchPlace(token(), placeId, patch),
  },
  geofences: {
    list: (childId) => geofences.listGeofences(token(), childId),
    create: (childId, input) => geofences.createGeofence(token(), childId, input),
    patch: (geofenceId, patch) => geofences.patchGeofence(token(), geofenceId, patch),
    remove: async (geofenceId) => {
      await geofences.deleteGeofence(token(), geofenceId);
    },
  },
  risk: {
    get: (childId) => risk.getRisk(token(), childId),
    history: (childId) => risk.getRiskHistory(token(), childId),
  },
  alerts: {
    listForChild: (childId) => alerts.listAlerts(token(), childId),
    listAll: () => alerts.listAllAlerts(token()),
    patch: (alertId, status) => alerts.patchAlert(token(), alertId, status),
  },
  sharing: {
    list: (childId) => sharing.listShares(token(), childId),
    create: (childId, input) => sharing.createShare(token(), childId, input),
    get: (shareId) => sharing.getShare(token(), shareId),
    patch: (shareId, patch) => sharing.patchShare(token(), shareId, patch),
    myPermissions: (childId) => sharing.getMyPermissions(token(), childId),
    audit: (childId) => sharing.listAccessAudit(token(), childId),
  },
  community: {
    list: () => community.listCommunityReports(token()),
    create: (input) => community.createCommunityReport(token(), input),
  },
  searchZone: {
    get: (childId) => nullIfNotFound(searchZone.getSearchZone(token(), childId)),
    declareDisappearance: async (childId) => {
      await searchZone.postDisappearance(token(), childId);
    },
  },
  emergencyContacts: {
    list: (childId) => emergencyContacts.listEmergencyContacts(token(), childId),
    create: (childId, input) => emergencyContacts.createEmergencyContact(token(), childId, input),
  },
  audio: {
    activate: (childId, input) => audio.requestAudioActivation(token(), childId, input),
    logs: (childId) => audio.listAudioLogs(token(), childId),
  },
  device: {
    getSettings: async (childId) => {
      const status = await device.getDeviceSettings(token(), childId);
      return { energyMode: status.energyMode, sensitivity: status.sensitivity, configVersion: status.configVersion };
    },
    patchSettings: async (childId, patch) => {
      const status = await device.patchDeviceSettings(token(), childId, patch);
      return { energyMode: status.energyMode, sensitivity: status.sensitivity, configVersion: status.configVersion };
    },
  },
};
