import { useEffect } from 'react';
import { View, Text, StyleSheet, Linking, Pressable } from 'react-native';
import { useOrderTracking } from '../hooks/useOrders';
import { Colors } from '../constants/colors';
import { Font } from '../constants/typography';
import { Eyebrow, Icon } from './ui';

// While the order is on the way: how far the Sthiva driver is (shared only from pickup to delivery)
function ago(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s} seconds ago` : `${Math.round(s / 60)} min ago`;
}

export function TrackingCard({ orderId, onStatusChange }: { orderId: string; onStatusChange?: () => void }) {
  const { data } = useOrderTracking(orderId, true);
  const t = data?.data;
  // Delivered (or cancelled) while watching: refresh the order screen
  useEffect(() => {
    if (t && t.status !== 'PICKED_UP' && t.status !== 'IN_TRANSIT') onStatusChange?.();
  }, [t?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!t) return null;
  const loc = t.sharing ? t.location : undefined;

  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <Eyebrow>On the way</Eyebrow>
      {loc ? (
        <>
          <Text style={styles.big}>
            {t.distanceKm !== undefined ? `Driver is about ${t.distanceKm < 1 ? 'less than 1' : t.distanceKm} km away` : 'Driver is on the way'}
          </Text>
          <Text style={styles.small}>
            {t.stale ? `Last seen ${ago(loc.at)}. Their phone may be out of signal.` : `Updated ${ago(loc.at)}.`} Straight-line distance.
          </Text>
          <Pressable
            style={styles.map}
            onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`)}
            accessibilityRole="button"
            accessibilityLabel="Open the driver's position in Google Maps"
          >
            <Icon name="map-marker-outline" size={18} color={Colors.ink} />
            <Text style={styles.mapText}>Open in Google Maps</Text>
          </Pressable>
        </>
      ) : (
        <Text style={styles.small}>The live position appears here once the driver opens the delivery in their app. It is shared only until your order is delivered.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 18, backgroundColor: Colors.sand2, borderWidth: 1.5, borderColor: Colors.ink },
  big: { fontFamily: Font.semiBold, fontSize: 18, lineHeight: 24, color: Colors.ink, marginTop: 6 },
  small: { fontFamily: Font.regular, fontSize: 14, lineHeight: 20, color: Colors.stone, marginTop: 4 },
  map: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, marginTop: 12, borderRadius: 22, backgroundColor: Colors.lime },
  mapText: { fontFamily: Font.bold, fontSize: 15, color: Colors.ink },
});
