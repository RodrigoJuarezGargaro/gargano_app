import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { compressRemitoPhoto } from '@/services/compress-photo';

export type CameraCaptureModalProps = {
  visible: boolean;
  onCancel: () => void;
  onCaptured: (photo: { uri: string; width?: number; height?: number }) => void;
  onUnavailable?: () => void;
};

export default function CameraCaptureModal({
  visible,
  onCancel,
  onCaptured,
  onUnavailable,
}: CameraCaptureModalProps) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isCapturing, setIsCapturing] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewSize, setPreviewSize] = useState<{ width?: number; height?: number }>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setIsCapturing(false);
      setPreviewUri(null);
      setPreviewSize({});
      setError(null);
      return;
    }
    if (!permission?.granted) {
      void requestPermission();
    }
  }, [visible, permission?.granted, requestPermission]);

  const handleCapture = async () => {
    if (isCapturing) {
      return;
    }
    setIsCapturing(true);
    setError(null);
    try {
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 0.4,
        exif: false,
        shutterSound: false,
      });
      if (!photo?.uri) {
        setError('No se pudo tomar la foto. Intentá de nuevo.');
        return;
      }
      const compressed = await compressRemitoPhoto(photo.uri);
      setPreviewUri(compressed.uri);
      setPreviewSize({ width: compressed.width, height: compressed.height });
    } catch (captureError) {
      const message = captureError instanceof Error ? captureError.message : String(captureError);
      setError(message || 'No se pudo tomar la foto.');
    } finally {
      setIsCapturing(false);
    }
  };

  const handleUsePhoto = () => {
    if (!previewUri) {
      return;
    }
    onCaptured({
      uri: previewUri,
      width: previewSize.width,
      height: previewSize.height,
    });
  };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.root}>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <Pressable onPress={onCancel} style={styles.headerButton} hitSlop={12}>
              <Ionicons name="close" size={26} color="#F2F5FB" />
            </Pressable>
            <Text style={styles.title}>Foto de remito</Text>
            <View style={styles.headerButton} />
          </View>

          <View style={styles.stage}>
            {previewUri ? (
              <Image source={{ uri: previewUri }} style={styles.preview} contentFit="contain" />
            ) : permission?.granted ? (
              <CameraView
                ref={cameraRef}
                style={styles.camera}
                facing="back"
                mode="picture"
                mute
                animateShutter={false}
                onMountError={() => {
                  setError('No se pudo iniciar la cámara en la app.');
                  onUnavailable?.();
                }}
              />
            ) : (
              <View style={styles.permissionBox}>
                <Text style={styles.permissionText}>
                  Se necesita permiso de cámara para fotografiar el remito.
                </Text>
                <Pressable style={styles.primaryButton} onPress={() => void requestPermission()}>
                  <Text style={styles.primaryButtonText}>Dar permiso</Text>
                </Pressable>
              </View>
            )}

            {isCapturing && (
              <View style={styles.capturingOverlay}>
                <ActivityIndicator color="#F2F5FB" size="large" />
                <Text style={styles.capturingText}>Preparando foto liviana…</Text>
              </View>
            )}
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.footer}>
            {previewUri ? (
              <>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => {
                    setPreviewUri(null);
                    setPreviewSize({});
                    setError(null);
                  }}>
                  <Text style={styles.secondaryButtonText}>Repetir</Text>
                </Pressable>
                <Pressable style={styles.primaryButton} onPress={handleUsePhoto}>
                  <Text style={styles.primaryButtonText}>Usar foto</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                style={[styles.shutterButton, isCapturing && styles.shutterButtonDisabled]}
                onPress={() => void handleCapture()}
                disabled={isCapturing || !permission?.granted}>
                <View style={styles.shutterInner} />
              </Pressable>
            )}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0D1222',
  },
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#F2F5FB',
    fontSize: 16,
    fontWeight: '600',
  },
  stage: {
    flex: 1,
    marginHorizontal: 12,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  preview: {
    flex: 1,
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  permissionText: {
    color: '#DCE2F1',
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
  },
  capturingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13, 18, 34, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  capturingText: {
    color: '#F2F5FB',
    fontSize: 14,
  },
  errorText: {
    color: '#F9B4B4',
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  footer: {
    minHeight: 96,
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  shutterButton: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 4,
    borderColor: '#F2F5FB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterButtonDisabled: {
    opacity: 0.5,
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F2F5FB',
  },
  primaryButton: {
    backgroundColor: '#673E8A',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 10,
  },
  primaryButtonText: {
    color: '#F2F5FB',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryButton: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A0C4FF',
  },
  secondaryButtonText: {
    color: '#A0C4FF',
    fontWeight: '600',
    fontSize: 15,
  },
});
