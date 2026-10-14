import { create } from 'zustand';
import type { ConnectionStatus } from '@/api/realtime/types';

interface UiState {
  selectedChildId: string | null;
  /** État du canal temps réel (WebSocket ou bus simulé). */
  connectionStatus: ConnectionStatus;
  /** Connectivité réseau du téléphone (NetInfo). */
  deviceOnline: boolean;
  setSelectedChildId: (id: string | null) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setDeviceOnline: (online: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedChildId: null,
  connectionStatus: 'connected',
  deviceOnline: true,
  setSelectedChildId: (id) => set({ selectedChildId: id }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setDeviceOnline: (online) => set({ deviceOnline: online }),
}));
