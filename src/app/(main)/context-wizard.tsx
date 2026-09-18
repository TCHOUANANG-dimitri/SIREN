import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Phone, Plus, Trash2, User } from 'lucide-react-native';
import { Banner, Button, Card, TextField, TimeField } from '@/components';
import { colors, fontFamily, radii, spacing, typography } from '@/theme';
import { MapPointRadiusPicker } from '@/features/tracking/MapPointRadiusPicker';
import { AddressMapField } from '@/features/tracking/AddressMapField';
import { useCreatePlace } from '@/api/hooks/usePlaces';
import { useCreateGeofence } from '@/api/hooks/useGeofences';
import { usePatchChildContext } from '@/api/hooks/useChildren';
import { useCreateEmergencyContact } from '@/api/hooks/useEmergencyContacts';
import { useLocationStore } from '@/stores/locationStore';
import { useTranslation } from 'react-i18next';


const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

type PointRadius = { lat: number; lon: number; radiusM: number };
type FrequentPlace = { nom: string } & PointRadius;
type Contact = { nom: string; telephone: string };

export default function ContextWizardScreen() {
  const { t } = useTranslation();
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const [step, setStep] = useState(0);

  const stepLabels = [
    t('wizard.steps.home'),
    t('wizard.steps.school'),
    t('wizard.steps.places'),
    t('wizard.steps.perimeter'),
    t('wizard.steps.sleep'),
  ];
  const storeLat = useLocationStore((s) => s.latitude);
  const storeLon = useLocationStore((s) => s.longitude);
  const initialCenter = { lat: storeLat, lon: storeLon };
  const [center] = useState(initialCenter);

  const [homeAddress, setHomeAddress] = useState('');
  const [home, setHome] = useState<PointRadius>({ ...initialCenter, radiusM: 75 });

  const [schoolAddress, setSchoolAddress] = useState('');
  const [school, setSchool] = useState<PointRadius>({ ...initialCenter, radiusM: 100 });
  const [schoolDays, setSchoolDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [schoolStart, setSchoolStart] = useState('07:00');
  const [schoolEnd, setSchoolEnd] = useState('15:30');

  const [frequentPlaces, setFrequentPlaces] = useState<FrequentPlace[]>([]);
  const [newPlaceName, setNewPlaceName] = useState('');
  const [newPlaceError, setNewPlaceError] = useState('');
  const [newPlaceAddress, setNewPlaceAddress] = useState('');
  const [newPlacePoint, setNewPlacePoint] = useState<PointRadius>({ ...initialCenter, radiusM: 60 });

  const [perimeter, setPerimeter] = useState<PointRadius>({ ...initialCenter, radiusM: 1200 });

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



  function toggleDay(index: number) {
    setSchoolDays((days) => (days.includes(index) ? days.filter((d) => d !== index) : [...days, index].sort()));
  }

  function addFrequentPlace() {
    const nom = newPlaceName.trim();
    if (!nom) {
      setNewPlaceError(t('wizard.placeNameRequired'));
      return;
    }
    // Un lieu porte un nom libre choisi par le parent (« chez grand-mère ») :
    // deux entrées homonymes seraient indistinguables dans les alertes.
    if (frequentPlaces.some((p) => p.nom.toLocaleLowerCase() === nom.toLocaleLowerCase())) {
      setNewPlaceError(t('wizard.placeNameDuplicate'));
      return;
    }
    setFrequentPlaces((places) => [...places, { nom, ...newPlacePoint }]);
    setNewPlaceName('');
    setNewPlaceError('');
    setNewPlaceAddress('');
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
      await createPlace.mutateAsync({ nom: homeAddress || t('wizard.defaultHomeName'), ...home, icon: 'maison' });
      if (schoolAddress.trim()) {
        await createPlace.mutateAsync({
          nom: schoolAddress || t('wizard.defaultSchoolName'),
          ...school,
          icon: 'ecole',
          schedule: [{ jours: schoolDays, heureDebut: schoolStart, heureFin: schoolEnd }],
        });
      }
      for (const place of frequentPlaces) {
        await createPlace.mutateAsync({ nom: place.nom, lat: place.lat, lon: place.lon, radiusM: place.radiusM, icon: 'lieu' });
      }
      await createGeofence.mutateAsync({
        nom: t('wizard.perimeterTitle'),
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
        <Banner kind="success" message={t('wizard.saved')} />
      </View>
    );
  }

  const isLastStep = step === stepLabels.length - 1;

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.tabsRow}>
        {stepLabels.map((label, i) => (
          <View key={label} style={[styles.tabChip, i === step && styles.tabChipActive]}>
            <Text style={[styles.tabChipText, i === step && styles.tabChipTextActive]}>{label}</Text>
          </View>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 0 && (
          <View>
            <Text style={styles.title}>{t('wizard.homeTitle')}</Text>
            <Text style={styles.subtitle}>{t('wizard.homeSubtitle')}</Text>
            <AddressMapField
              label={t('wizard.address')}
              placeholder={t('wizard.homeAddressPlaceholder')}
              address={homeAddress}
              onAddressChange={setHomeAddress}
              point={home}
              onPointChange={setHome}
              minRadius={50}
              maxRadius={150}
            />
          </View>
        )}

        {step === 1 && (
          <View>
            <Text style={styles.title}>{t('wizard.schoolTitle')}</Text>
            <Text style={styles.subtitle}>{t('wizard.schoolSubtitle')}</Text>
            <AddressMapField
              label={t('wizard.address')}
              placeholder={t('wizard.schoolAddressPlaceholder')}
              address={schoolAddress}
              onAddressChange={setSchoolAddress}
              point={school}
              onPointChange={setSchool}
              minRadius={50}
              maxRadius={300}
            />
            <Text style={styles.fieldLabel}>{t('wizard.attendanceDays')}</Text>
            <View style={styles.daysRow}>
              {DAYS.map((d, i) => (
                <Pressable key={i} onPress={() => toggleDay(i)} style={[styles.dayChip, schoolDays.includes(i) && styles.dayChipActive]}>
                  <Text style={[styles.dayChipText, schoolDays.includes(i) && styles.dayChipTextActive]}>{d}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.timeRow}>
              <View style={styles.timeField}>
                <TimeField label={t('wizard.arrivalTime')} value={schoolStart} onChange={setSchoolStart} />
              </View>
              <View style={styles.timeField}>
                <TimeField label={t('wizard.departureTime')} value={schoolEnd} onChange={setSchoolEnd} />
              </View>
            </View>
          </View>
        )}

        {step === 2 && (
          <View>
            <Text style={styles.title}>{t('wizard.placesTitle')}</Text>
            <Text style={styles.subtitle}>
              {t('wizard.placesSubtitle')}
            </Text>
            {frequentPlaces.map((place, i) => (
              <Card key={`${place.nom}-${i}`} style={styles.placeCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.placeName}>{place.nom}</Text>
                  <Text style={styles.placeCoords}>
                    {place.lat.toFixed(5)}, {place.lon.toFixed(5)} · {place.radiusM} m
                  </Text>
                </View>
                <Pressable onPress={() => setFrequentPlaces((list) => list.filter((_, idx) => idx !== i))} hitSlop={8}>
                  <Trash2 size={18} color={colors.urgence} />
                </Pressable>
              </Card>
            ))}
            <TextField
              label={t('wizard.placeName')}
              value={newPlaceName}
              onChangeText={(text) => {
                setNewPlaceName(text);
                if (text.trim()) setNewPlaceError('');
              }}
              placeholder={t('wizard.placeNamePlaceholder')}
              error={newPlaceError}
            />
            {/* Beaucoup de lieux n'ont pas d'adresse exploitable : le parent peut
                soit en saisir une, soit pointer directement sur la carte. */}
            <AddressMapField
              label={t('wizard.addressOrPosition')}
              placeholder={t('wizard.searchAddress')}
              address={newPlaceAddress}
              onAddressChange={setNewPlaceAddress}
              point={newPlacePoint}
              onPointChange={setNewPlacePoint}
              minRadius={30}
              maxRadius={300}
            />
            <Button label={t('wizard.addPlace')} variant="secondary" icon={<Plus size={16} color={colors.primary} />} onPress={addFrequentPlace} />
          </View>
        )}

        {step === 3 && (
          <View>
            <Text style={styles.title}>{t('wizard.perimeterTitle')}</Text>
            <Text style={styles.subtitle}>{t('wizard.perimeterSubtitle')}</Text>
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
            <Text style={styles.title}>{t('wizard.sleepTitle')}</Text>
            <Text style={styles.subtitle}>{t('wizard.sleepSubtitle')}</Text>
            <View style={styles.timeRow}>
              <View style={styles.timeField}>
                <TimeField label={t('wizard.bedtime')} value={sleepStart} onChange={setSleepStart} />
              </View>
              <View style={styles.timeField}>
                <TimeField label={t('wizard.wakeTime')} value={sleepEnd} onChange={setSleepEnd} />
              </View>
            </View>

            <Text style={styles.fieldLabel}>{t('wizard.emergencyContacts')}</Text>
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
            <TextField label={t('wizard.contactName')} value={contactName} onChangeText={setContactName} placeholder={t('wizard.contactNamePlaceholder')} />
            <TextField label={t('common.phone')} value={contactPhone} onChangeText={setContactPhone} placeholder={t('wizard.contactPhonePlaceholder')} keyboardType="phone-pad" />
            <Button label={t('wizard.addContact')} variant="secondary" icon={<Phone size={16} color={colors.primary} />} onPress={addContact} />
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
            {t('common.completeLater')}
          </Text>
        )}
      </View>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surface },
  tabsRow: { flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm, flexWrap: 'wrap' },
  tabChip: { backgroundColor: colors.surfaceChip, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  tabChipActive: { backgroundColor: colors.primary },
  tabChipText: { ...typography.caption, fontFamily: fontFamily.semiBold, color: colors.muted },
  tabChipTextActive: { color: colors.white },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  title: { ...typography.title2, fontFamily: fontFamily.bold, color: colors.ink, marginBottom: 4 },
  subtitle: { ...typography.caption, color: colors.muted, marginBottom: spacing.lg },
  fieldLabel: { ...typography.label, fontFamily: fontFamily.semiBold, color: colors.slate, marginBottom: spacing.sm },
  daysRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  dayChip: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceChip },
  dayChipActive: { backgroundColor: colors.primary },
  dayChipText: { ...typography.caption, fontFamily: fontFamily.semiBold, color: colors.muted },
  dayChipTextActive: { color: colors.white },
  timeRow: { flexDirection: 'row', gap: spacing.md },
  timeField: { flex: 1 },
  placeCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  placeName: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.ink },
  placeCoords: { ...typography.caption, color: colors.muted, marginTop: 2 },
  contactPhone: { ...typography.caption, color: colors.muted },
  addRow: { marginBottom: spacing.sm },
  footer: { padding: spacing.lg, gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  completeLaterLink: { ...typography.body, fontFamily: fontFamily.medium, color: colors.muted, textAlign: 'center' },
  successContainer: { flex: 1, backgroundColor: colors.surface, justifyContent: 'center', padding: spacing.xl },
});
