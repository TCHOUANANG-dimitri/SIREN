import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { Phone, Plus, Trash2, User } from 'lucide-react-native';
import { Banner, Button, Card, TextField } from '@/components';
import { colors, fontFamily, radii, spacing, typography } from '@/theme';
import { MapPointRadiusPicker } from '@/features/tracking/MapPointRadiusPicker';
import { useCreatePlace } from '@/api/hooks/usePlaces';
import { useCreateGeofence } from '@/api/hooks/useGeofences';
import { usePatchChildContext } from '@/api/hooks/useChildren';
import { useCreateEmergencyContact } from '@/api/hooks/useEmergencyContacts';

const FALLBACK_CENTER = { lat: 3.848, lon: 11.5021 }; // Yaoundé — repli si la position n'est pas accessible
const STEP_LABELS = ['1 Maison', '2 École', '3 Lieux', '4 Périmètre', '5 Sommeil'];
const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

type PointRadius = { lat: number; lon: number; radiusM: number };
type FrequentPlace = { nom: string } & PointRadius;
type Contact = { nom: string; telephone: string };

export default function ContextWizardScreen() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const [step, setStep] = useState(0);
  const [center, setCenter] = useState(FALLBACK_CENTER);

  const [homeAddress, setHomeAddress] = useState('');
  const [home, setHome] = useState<PointRadius>({ ...FALLBACK_CENTER, radiusM: 75 });

  const [schoolAddress, setSchoolAddress] = useState('');
  const [school, setSchool] = useState<PointRadius>({ ...FALLBACK_CENTER, radiusM: 100 });
  const [schoolDays, setSchoolDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [schoolStart, setSchoolStart] = useState('07:00');
  const [schoolEnd, setSchoolEnd] = useState('15:30');

  const [frequentPlaces, setFrequentPlaces] = useState<FrequentPlace[]>([]);
  const [newPlaceName, setNewPlaceName] = useState('');

  const [perimeter, setPerimeter] = useState<PointRadius>({ ...FALLBACK_CENTER, radiusM: 1200 });

  const [sleepStart, setSleepStart] = useState('22:00');
  const [sleepEnd, setSleepEnd] = useState('06:00');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const createPlace = useCreatePlace(childId);
  const createGeofence = useCreateGeofence(childId);
  const patchContext = usePatchChildContext(childId);
  const createContact = useCreateEmergencyContact(childId);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      try {
        const position = await Location.getCurrentPositionAsync({});
        const point = { lat: position.coords.latitude, lon: position.coords.longitude };
        setCenter(point);
        setHome((h) => ({ ...h, ...point }));
        setSchool((s) => ({ ...s, ...point }));
        setPerimeter((p) => ({ ...p, ...point }));
      } catch {
        // Position indisponible : le repli Yaoundé reste utilisé.
      }
    })();
  }, []);

  function toggleDay(index: number) {
    setSchoolDays((days) => (days.includes(index) ? days.filter((d) => d !== index) : [...days, index].sort()));
  }

  function addFrequentPlace() {
    if (!newPlaceName.trim()) return;
    setFrequentPlaces((places) => [...places, { nom: newPlaceName.trim(), ...center, radiusM: 60 }]);
    setNewPlaceName('');
  }

  function addContact() {
    if (!contactName.trim() || !contactPhone.trim()) return;
    setContacts((list) => [...list, { nom: contactName.trim(), telephone: contactPhone.trim() }]);
    setContactName('');
    setContactPhone('');
  }

  async function saveAll() {
    if (!childId) return;
    setSaving(true);
    try {
      await createPlace.mutateAsync({ nom: homeAddress || 'Maison', ...home, icon: 'maison' });
      if (schoolAddress.trim()) {
        await createPlace.mutateAsync({
          nom: schoolAddress || 'École',
          ...school,
          icon: 'ecole',
          schedule: [{ jours: schoolDays, heureDebut: schoolStart, heureFin: schoolEnd }],
        });
      }
      for (const place of frequentPlaces) {
        await createPlace.mutateAsync({ nom: place.nom, lat: place.lat, lon: place.lon, radiusM: place.radiusM, icon: 'lieu' });
      }
      await createGeofence.mutateAsync({
        nom: 'Périmètre autorisé',
        type: 'autorise',
        lat: perimeter.lat,
        lon: perimeter.lon,
        radiusM: perimeter.radiusM,
        notifyOnEnter: true,
        notifyOnExit: true,
      });
      await patchContext.mutateAsync({ sleepSchedule: { jours: [0, 1, 2, 3, 4, 5, 6], heureDebut: sleepStart, heureFin: sleepEnd } });
      for (const contact of contacts) {
        await createContact.mutateAsync(contact);
      }
      setSaved(true);
      setTimeout(() => router.replace('/(main)/(tabs)'), 1400);
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <View style={styles.successContainer}>
        <Banner kind="success" message="Protection de base activée — les couches 1 et 2 sont désormais actives." />
      </View>
    );
  }

  const isLastStep = step === STEP_LABELS.length - 1;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.tabsRow}>
        {STEP_LABELS.map((label, i) => (
          <View key={label} style={[styles.tabChip, i === step && styles.tabChipActive]}>
            <Text style={[styles.tabChipText, i === step && styles.tabChipTextActive]}>{label}</Text>
          </View>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 0 && (
          <View>
            <Text style={styles.title}>Où est votre domicile ?</Text>
            <Text style={styles.subtitle}>Sélectionnez l'adresse et le rayon de protection autour de chez vous.</Text>
            <TextField label="Adresse (facultatif)" value={homeAddress} onChangeText={setHomeAddress} placeholder="12 Rue des Acacias, Yaoundé" />
            <MapPointRadiusPicker
              latitude={home.lat}
              longitude={home.lon}
              radiusM={home.radiusM}
              minRadius={50}
              maxRadius={150}
              onChange={(v) => setHome({ lat: v.lat, lon: v.lon, radiusM: v.radiusM })}
            />
          </View>
        )}

        {step === 1 && (
          <View>
            <Text style={styles.title}>Où est l'école ?</Text>
            <Text style={styles.subtitle}>Adresse, rayon et horaires de présence attendue.</Text>
            <TextField label="Adresse (facultatif)" value={schoolAddress} onChangeText={setSchoolAddress} placeholder="École primaire du quartier" />
            <MapPointRadiusPicker
              latitude={school.lat}
              longitude={school.lon}
              radiusM={school.radiusM}
              minRadius={50}
              maxRadius={300}
              onChange={(v) => setSchool({ lat: v.lat, lon: v.lon, radiusM: v.radiusM })}
            />
            <Text style={styles.fieldLabel}>Jours de présence</Text>
            <View style={styles.daysRow}>
              {DAYS.map((d, i) => (
                <Pressable key={i} onPress={() => toggleDay(i)} style={[styles.dayChip, schoolDays.includes(i) && styles.dayChipActive]}>
                  <Text style={[styles.dayChipText, schoolDays.includes(i) && styles.dayChipTextActive]}>{d}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.timeRow}>
              <View style={styles.timeField}>
                <TextField label="Heure d'arrivée" value={schoolStart} onChangeText={setSchoolStart} placeholder="07:00" />
              </View>
              <View style={styles.timeField}>
                <TextField label="Heure de sortie" value={schoolEnd} onChangeText={setSchoolEnd} placeholder="15:30" />
              </View>
            </View>
          </View>
        )}

        {step === 2 && (
          <View>
            <Text style={styles.title}>Lieux fréquents</Text>
            <Text style={styles.subtitle}>Église, marché, grand-mère… Utilisez votre position actuelle pour chaque lieu.</Text>
            {frequentPlaces.map((place, i) => (
              <Card key={`${place.nom}-${i}`} style={styles.placeCard}>
                <Text style={styles.placeName}>{place.nom}</Text>
                <Pressable onPress={() => setFrequentPlaces((list) => list.filter((_, idx) => idx !== i))} hitSlop={8}>
                  <Trash2 size={18} color={colors.urgence} />
                </Pressable>
              </Card>
            ))}
            <View style={styles.addRow}>
              <View style={{ flex: 1 }}>
                <TextField label="Nom du lieu" value={newPlaceName} onChangeText={setNewPlaceName} placeholder="Église, marché…" />
              </View>
            </View>
            <Button label="Ajouter ce lieu (position actuelle)" variant="secondary" icon={<Plus size={16} color={colors.primary} />} onPress={addFrequentPlace} />
          </View>
        )}

        {step === 3 && (
          <View>
            <Text style={styles.title}>Périmètre autorisé</Text>
            <Text style={styles.subtitle}>Zone quartier/ville en dehors de laquelle une sortie sera signalée.</Text>
            <MapPointRadiusPicker
              latitude={perimeter.lat}
              longitude={perimeter.lon}
              radiusM={perimeter.radiusM}
              minRadius={300}
              maxRadius={5000}
              height={240}
              onChange={(v) => setPerimeter({ lat: v.lat, lon: v.lon, radiusM: v.radiusM })}
            />
          </View>
        )}

        {step === 4 && (
          <View>
            <Text style={styles.title}>Sommeil & contacts d'urgence</Text>
            <Text style={styles.subtitle}>Plage horaire habituelle de sommeil et personnes à prévenir.</Text>
            <View style={styles.timeRow}>
              <View style={styles.timeField}>
                <TextField label="Coucher" value={sleepStart} onChangeText={setSleepStart} placeholder="22:00" />
              </View>
              <View style={styles.timeField}>
                <TextField label="Réveil" value={sleepEnd} onChangeText={setSleepEnd} placeholder="06:00" />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Contacts d'urgence</Text>
            {contacts.map((c, i) => (
              <Card key={`${c.nom}-${i}`} style={styles.placeCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <User size={16} color={colors.muted} />
                  <View>
                    <Text style={styles.placeName}>{c.nom}</Text>
                    <Text style={styles.contactPhone}>{c.telephone}</Text>
                  </View>
                </View>
                <Pressable onPress={() => setContacts((list) => list.filter((_, idx) => idx !== i))} hitSlop={8}>
                  <Trash2 size={18} color={colors.urgence} />
                </Pressable>
              </Card>
            ))}
            <TextField label="Nom du contact" value={contactName} onChangeText={setContactName} placeholder="Papa, Grand-mère…" />
            <TextField label="Téléphone" value={contactPhone} onChangeText={setContactPhone} placeholder="+237 6 __ __ __ __" keyboardType="phone-pad" />
            <Button label="Ajouter ce contact" variant="secondary" icon={<Phone size={16} color={colors.primary} />} onPress={addContact} />
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={isLastStep ? 'Enregistrer et continuer' : 'Suivant →'}
          onPress={isLastStep ? saveAll : () => setStep((s) => s + 1)}
          loading={saving}
        />
        {step > 0 && (
          <Text style={styles.completeLaterLink} onPress={saveAll}>
            Compléter plus tard
          </Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surface },
  tabsRow: { flexDirection: 'row', gap: 4, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm, flexWrap: 'wrap' },
  tabChip: { backgroundColor: '#F0EDE8', borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 5 },
  tabChipActive: { backgroundColor: colors.primary },
  tabChipText: { ...typography.caption, fontFamily: fontFamily.semiBold, color: colors.muted },
  tabChipTextActive: { color: colors.white },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  title: { ...typography.title2, fontFamily: fontFamily.bold, color: colors.ink, marginBottom: 4 },
  subtitle: { ...typography.caption, color: colors.muted, marginBottom: spacing.lg },
  fieldLabel: { ...typography.label, fontFamily: fontFamily.semiBold, color: colors.slate, marginBottom: spacing.sm },
  daysRow: { flexDirection: 'row', gap: 8, marginBottom: spacing.lg },
  dayChip: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0EDE8' },
  dayChipActive: { backgroundColor: colors.primary },
  dayChipText: { ...typography.caption, fontFamily: fontFamily.semiBold, color: colors.muted },
  dayChipTextActive: { color: colors.white },
  timeRow: { flexDirection: 'row', gap: spacing.md },
  timeField: { flex: 1 },
  placeCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  placeName: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.ink },
  contactPhone: { ...typography.caption, color: colors.muted },
  addRow: { marginBottom: spacing.sm },
  footer: { padding: spacing.lg, gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  completeLaterLink: { ...typography.body, fontFamily: fontFamily.medium, color: colors.muted, textAlign: 'center' },
  successContainer: { flex: 1, backgroundColor: colors.surface, justifyContent: 'center', padding: spacing.xl },
});
