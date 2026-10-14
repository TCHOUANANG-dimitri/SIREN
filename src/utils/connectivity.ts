import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { useUiStore } from '@/stores/uiStore';

/**
 * Relie l'état réseau réel du téléphone à React Query (mise en pause des
 * requêtes / reprise de la file) et au bandeau hors-ligne.
 */
export function initConnectivity() {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      // isInternetReachable vaut null tant qu'il n'est pas déterminé : on ne conclut pas au hors-ligne.
      const online = state.isConnected !== false && state.isInternetReachable !== false;
      setOnline(online);
      useUiStore.getState().setDeviceOnline(online);
    })
  );
}
