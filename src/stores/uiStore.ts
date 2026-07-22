import { create } from 'zustand';

interface UiState {
  selectedChildId: string | null;
  demoModeActive: boolean;
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting';
  setSelectedChildId: (id: string | null) => void;
  setDemoModeActive: (active: boolean) => void;
  setConnectionStatus: (status: UiState['connectionStatus']) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedChildId: null,
  demoModeActive: true,
  connectionStatus: 'connected',
  setSelectedChildId: (id) => set({ selectedChildId: id }),
  setDemoModeActive: (active) => set({ demoModeActive: active }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
}));
