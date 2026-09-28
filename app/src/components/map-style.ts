import type { MapStyleElement } from 'react-native-maps';

/**
 * Google Maps JSON styles from tokens.json (color.map). A muted basemap with points of interest
 * off, so status markers are the only saturated color on the map. JSON styling works without a
 * Map ID, which keeps map loads on the free SKU (confirm in the Cloud billing console).
 */
const base = (c: { land: string; road: string; casing: string; label: string; water: string; park: string; rail: string }): MapStyleElement[] => [
  { elementType: 'geometry', stylers: [{ color: c.land }] },
  { elementType: 'labels.text.fill', stylers: [{ color: c.label }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: c.land }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: c.park }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: c.road }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: c.casing }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'simplified' }, { lightness: 30 }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: c.rail }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: c.water }] },
];

export const MapStyles = {
  light: base({ land: '#EEF0F2', road: '#FFFFFF', casing: '#D8DCE1', label: '#6B7280', water: '#D5DEE7', park: '#E3E9E5', rail: '#8A919C' }),
  dark: base({ land: '#1B1E22', road: '#2C3137', casing: '#24282D', label: '#8A919C', water: '#1E2A33', park: '#1F2624', rail: '#8A919C' }),
};
