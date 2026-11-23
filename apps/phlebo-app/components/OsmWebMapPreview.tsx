import React, { useEffect, useMemo } from 'react';
import { Linking, Platform, Text, TouchableOpacity, View } from 'react-native';
import { styles } from '../styles/phleboStyles';

export interface GoogleWebMapPreviewProps {
  latitude: number;
  longitude: number;
  address?: string;
  title?: string;
  height?: number;
  onOpenGoogleMaps?: () => void;
}

export function buildGoogleMapsEmbedUrl(lat: number, lng: number): string {
  return `https://maps.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}&hl=en&z=16&output=embed`;
}

export function GoogleWebMapPreview({
  latitude,
  longitude,
  address,
  title,
  height = 170,
  onOpenGoogleMaps,
}: GoogleWebMapPreviewProps) {
  const hostId = useMemo(
    () => `phlebo-gmap-host-${Math.random().toString(36).slice(2, 10)}`,
    []
  );
  const safeLat = Number.isFinite(latitude) && Math.abs(latitude) > 0.001 ? latitude : 19.124;
  const safeLng = Number.isFinite(longitude) && Math.abs(longitude) > 0.001 ? longitude : 72.866;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const host = document.getElementById(hostId);
    if (!host) return;
    host.innerHTML = '';
    const frame = document.createElement('iframe');
    frame.src = buildGoogleMapsEmbedUrl(safeLat, safeLng);
    frame.title = title || 'Google Maps Live Preview';
    frame.style.width = '100%';
    frame.style.height = '100%';
    frame.style.border = '0';
    frame.loading = 'lazy';
    host.appendChild(frame);
    return () => {
      host.innerHTML = '';
    };
  }, [hostId, safeLat, safeLng, title]);

  const openGoogleMapsExternal = () => {
    if (onOpenGoogleMaps) {
      onOpenGoogleMaps();
      return;
    }
    const url = `https://www.google.com/maps/dir/?api=1&destination=${safeLat.toFixed(6)},${safeLng.toFixed(6)}`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    void Linking.openURL(url);
  };

  return (
    <View style={styles.osmCard}>
      <View style={styles.osmCardHeader}>
        <Text style={styles.osmCardTitle}>🗺️ {title || 'Google Maps Preview'}</Text>
        <Text style={styles.osmCoordChip} numberOfLines={1}>
          {address ? '📍 Verified Location' : '📍 Map Location'}
        </Text>
      </View>

      {Platform.OS === 'web' ? (
        <View nativeID={hostId} style={[styles.osmViewport, { height }]} />
      ) : (
        <View style={[styles.osmNativeFallback, { height: Math.min(110, height) }]}>
          <Text style={styles.osmNativeCoords} numberOfLines={2}>
            📍 {address ? address : 'Verified Destination Location'}
          </Text>
          <Text style={styles.osmNativeHint}>
            Tap below to launch live turn-by-turn navigation in Google Maps.
          </Text>
        </View>
      )}

      <View style={styles.osmActionsRow}>
        <TouchableOpacity style={styles.osmLinkBtnPrimary} onPress={openGoogleMapsExternal}>
          <Text style={styles.osmLinkBtnPrimaryText}>Open in Google Maps ↗</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Backward-compatibility alias
export const OsmWebMapPreview = GoogleWebMapPreview;
export type OsmWebMapPreviewProps = GoogleWebMapPreviewProps;
