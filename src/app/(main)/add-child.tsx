import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Camera as CameraIcon, CheckCircle2, Keyboard, Plus } from 'lucide-react-native';
import { Banner, Button, Card, ProgressSteps, SerialInput, TextField } from '@/components';
import { fontFamily, radii, spacing, typography, makeStyles, useTheme } from '@/theme';
import { useChildren, useCreateChild, useFindDevice, usePairDevice } from '@/api/hooks/useChildren';
import { ApiError } from '@/api/network';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { isRemotePhoto, saveLocalChildPhoto } from '@/features/children/localPhotos';
import { parseQrPayload, serialFromBody } from '@/features/pairing/serial';

type Step = 'profil' | 'appairage' | 'verification';

export default function AddChildScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  // Avec `childId` : (ré)association d'un boîtier à un enfant existant (étape profil sautée).
  const { childId: existingChildId } = useLocalSearchParams<{ childId?: string }>();
  const [step, setStep] = useState<Step>(existingChildId ? 'appairage' : 'profil');
  const [prenom, setPrenom] = useState('');
  const [prenomError, setPrenomError] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const [serialBody, setSerialBody] = useState('');
  const [pairedSerial, setPairedSerial] = useState('');
  // PIN d'activation imprimé sur la boîte : demandé seulement si le serveur l'exige.
  const [pinFor, setPinFor] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [manualEntry, setManualEntry] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [pairingError, setPairingError] = useState('');
  const [createdChildId, setCreatedChildId] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const { data: children } = useChildren();
  const findDevice = useFindDevice();
  const createChild = useCreateChild();
  const pairDevice = usePairDevice(existingChildId);
  const stepIndex = { profil: 0, appairage: 1, verification: 2 }[step];

  async function pickPhoto() {
    // allowsEditing ouvre le recadreur natif ; aspect [1,1] le contraint au
    // carré, format sous lequel la photo est affichée partout dans l'app.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) setPhotoUrl(result.assets[0].uri);
  }

  /**
   * `serial` est déjà au format exact SIREN-XXXXX-XXXXX : il est transmis tel quel
   * (aucune conversion de casse). Le PIN n'est demandé que si le serveur l'exige.
   */
  async function handleDeviceSubmit(serial: string, activationPin?: string) {
    setScanned(true);
    setPairingError('');
    try {
      if (!activationPin) {
        const found = await findDevice.mutateAsync(serial);
        if (found.pinRequired) {
          setPinFor(serial);
          setPin('');
          setManualEntry(true);
          setScanned(false);
          return;
        }
      }
      if (existingChildId) {
        await pairDevice.mutateAsync({ deviceId: serial, activationPin });
        setPairedSerial(serial);
        setPinFor(null);
        setCreatedChildId(existingChildId);
        setStep('verification');
        return;
      }
      // Seule une adresse http(s) part au serveur ; une photo du téléphone reste locale.
      const child = await createChild.mutateAsync({
        prenom,
        deviceId: serial,
        photoUrl: isRemotePhoto(photoUrl) ? photoUrl : undefined,
        activationPin,
      });
      if (photoUrl && !isRemotePhoto(photoUrl)) await saveLocalChildPhoto(child.id, photoUrl).catch(() => {});
      setPairedSerial(serial);
      setPinFor(null);
      setCreatedChildId(child.id);
      setStep('verification');
    } catch (error) {
      // L'erreur était auparavant avalée : en cas de dispositif déjà associé ou
      // de prénom en doublon, l'écran se réinitialisait sans rien expliquer.
      setPairingError(
        error instanceof ApiError ? error.message : t('children.pairingFailed')
      );
      setScanned(false);
    }
  }

  function onBarcodeScanned({ data }: { data: string }) {
    if (findDevice.isPending || createChild.isPending || pairDevice.isPending) return;
    // Le contenu du QR est une donnée : seul un numéro exact est accepté, rien n'est ouvert.
    const serial = parseQrPayload(data);
    if (!serial) {
      setScanned(true);
      setPairingError(t('children.qrInvalid'));
      // Laisse le temps de lire le message avant de rescanner.
      setTimeout(() => setScanned(false), 2000);
      return;
    }
    void handleDeviceSubmit(serial);
  }

  const busy = findDevice.isPending || createChild.isPending || pairDevice.isPending;
  const completeSerial = serialFromBody(serialBody);

  return (
    <SafeAreaView style={styles.flex} edges={['top']}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ProgressSteps steps={[t('children.stepProfile'), t('children.stepPairing'), t('children.stepCheck')]} currentIndex={stepIndex} />

        {step === 'profil' && (
          <View style={styles.stepBlock}>
            <Text style={styles.title}>{t('children.profileTitle')}</Text>
            <Text style={styles.subtitle}>{t('children.profileSubtitle')}</Text>

            <Pressable style={styles.photoPicker} onPress={pickPhoto}>
              {photoUrl ? (
                <Image source={{ uri: photoUrl }} style={styles.photo} />
              ) : (
                <CameraIcon size={28} color={colors.accent} />
              )}
              <View style={styles.photoBadge}>
                <Plus size={12} color={colors.onPrimary} strokeWidth={3} />
              </View>
            </Pressable>

            <TextField
              label={t('children.firstName')}
              value={prenom}
              onChangeText={(text) => {
                setPrenom(text);
                if (text.trim()) setPrenomError('');
              }}
              placeholder={t('children.firstNamePlaceholder')}
              error={prenomError}
            />

            <Button
              label={`${t('common.next')} →`}
              onPress={() => {
                const saisi = prenom.trim();
                if (!saisi) {
                  setPrenomError(t('children.firstNameRequired'));
                  return;
                }
                // Contrôle du doublon dès cette étape : le serveur le refuse
                // aussi, mais laisser scanner un QR code pour n'apprendre
                // qu'ensuite que le prénom est pris serait pénible.
                const existeDeja = (children ?? []).some(
                  (c) => c.prenom.trim().toLocaleLowerCase() === saisi.toLocaleLowerCase()
                );
                if (existeDeja) {
                  setPrenomError(t('children.duplicateName'));
                  return;
                }
                setStep('appairage');
              }}
            />
          </View>
        )}

        {step === 'appairage' && (
          <View style={styles.stepBlock}>
            <Text style={styles.title}>{t('children.pairTitle')}</Text>
            <Text style={styles.subtitle}>{t('children.pairSubtitle')}</Text>

            {!!pairingError && <Banner kind="error" message={pairingError} />}

            {!manualEntry ? (
              <>
                <View style={styles.scannerBox}>
                  {permission?.granted ? (
                    <CameraView
                      style={styles.scanner}
                      facing="back"
                      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                      onBarcodeScanned={scanned ? undefined : onBarcodeScanned}
                    />
                  ) : (
                    <View style={styles.scannerFallback}>
                      <CameraIcon size={32} color={colors.onPrimary} />
                      <Text style={styles.scannerFallbackText}>{t('children.cameraPermission')}</Text>
                      <Button label={t('children.allowCamera')} onPress={() => requestPermission()} />
                    </View>
                  )}
                </View>
                <Pressable onPress={() => setManualEntry(true)} style={styles.manualLink}>
                  <Keyboard size={14} color={colors.accent} />
                  <Text style={styles.manualLinkText}>{t('children.manualEntry')}</Text>
                </Pressable>
              </>
            ) : pinFor ? (
              <>
                <Text style={styles.serialEcho}>{pinFor}</Text>
                <TextField
                  label={t('children.pinLabel')}
                  value={pin}
                  onChangeText={(v) => setPin(v.replace(/\s/g, '').slice(0, 12))}
                  hint={t('children.pinHint')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={12}
                />
                <Button
                  label={busy ? t('children.searchingDevice') : t('children.pairWithPin')}
                  onPress={() => handleDeviceSubmit(pinFor, pin)}
                  loading={busy}
                  disabled={pin.length < 4}
                />
                <Button
                  label={t('children.changeSerial')}
                  variant="ghost"
                  onPress={() => {
                    setPinFor(null);
                    setPin('');
                    setPairingError('');
                  }}
                  style={{ marginTop: spacing.md }}
                />
              </>
            ) : (
              <>
                <SerialInput
                  label={t('children.deviceIdLabel')}
                  body={serialBody}
                  onChangeBody={(body) => {
                    setSerialBody(body);
                    if (pairingError) setPairingError('');
                  }}
                  editable={!busy}
                />
                <Button
                  label={busy ? t('children.searchingDevice') : t('children.searchDevice')}
                  onPress={() => completeSerial && handleDeviceSubmit(completeSerial)}
                  loading={busy}
                  // Validation uniquement quand les 10 caractères sont saisis.
                  disabled={!completeSerial}
                />
                <Pressable onPress={() => setManualEntry(false)} style={styles.manualLink} accessibilityRole="button">
                  <CameraIcon size={14} color={colors.accent} />
                  <Text style={styles.manualLinkText}>{t('children.scanInstead')}</Text>
                </Pressable>
              </>
            )}
          </View>
        )}

        {step === 'verification' && (
          <View style={[styles.stepBlock, styles.centered]}>
            <View style={styles.successIcon}>
              <CheckCircle2 size={44} color={colors.veille} />
            </View>
            <Text style={styles.title}>{t('children.paired')}</Text>
            <Text style={styles.subtitle}>{t('children.pairedBody')}</Text>

            <Card style={{ width: '100%', marginBottom: spacing.xl }}>
              <Text style={styles.cardLabel}>{t('children.device')}</Text>
              <View style={styles.cardRow}>
                <Text style={styles.cardKey}>ID</Text>
                <Text style={styles.cardValueMono}>{pairedSerial}</Text>
              </View>
              <View style={styles.cardRow}>
                <Text style={styles.cardKey}>{t('common.status')}</Text>
                <Text style={styles.cardValueOk}>{t('children.online')}</Text>
              </View>
            </Card>

            {existingChildId ? (
              <Button label={t('common.done')} onPress={() => router.back()} />
            ) : (
              <Button
                label={t('children.defineProtection')}
                onPress={() =>
                  router.replace({ pathname: '/(main)/context-wizard', params: { childId: createdChildId ?? '' } })
                }
              />
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1, backgroundColor: colors.surface },
  content: { flexGrow: 1, padding: spacing.xxl },
  stepBlock: { marginTop: spacing.xl },
  centered: { alignItems: 'center' },
  title: { ...typography.title1, fontFamily: fontFamily.bold, color: colors.ink, marginBottom: spacing.xs, textAlign: 'center' },
  subtitle: { ...typography.body, color: colors.muted, marginBottom: spacing.xl, textAlign: 'center' },
  photoPicker: {
    alignSelf: 'center',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  photo: { width: 88, height: 88, borderRadius: 44 },
  photoBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    borderWidth: 2.5,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerBox: { borderRadius: radii.xl, overflow: 'hidden', height: 260, marginBottom: spacing.lg, backgroundColor: '#1A1A1A' },
  scanner: { flex: 1 },
  scannerFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  scannerFallbackText: { ...typography.caption, color: colors.onPrimary, textAlign: 'center' },
  manualLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  manualLinkText: { ...typography.body, fontFamily: fontFamily.medium, color: colors.accent },
  successIcon: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.veilleSurface, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  cardLabel: { ...typography.label, color: colors.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.md },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  cardKey: { ...typography.body, color: colors.slate },
  cardValueMono: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.ink },
  serialEcho: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.ink, textAlign: 'center', marginBottom: spacing.lg, letterSpacing: 1 },
  cardValueOk: { ...typography.bodyStrong, fontFamily: fontFamily.semiBold, color: colors.veille },
}));
