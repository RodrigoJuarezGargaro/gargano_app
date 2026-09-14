import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image as RNImage,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ImageCropOverlay, {
  createDefaultCropFrame,
  getContainedImageRect,
  type CropFrame,
} from '@/components/image-crop-overlay';
import {
  cropAndCompressRemitoPhoto,
  preparePhotoForCrop,
  type PixelCrop,
} from '@/services/compress-photo';

export type CameraCaptureModalProps = {
  visible: boolean;
  onCancel: () => void;
  onCaptured: (photo: { uri: string; width?: number; height?: number }) => void;
  onUnavailable?: () => void;
};

type StageLayout = {
  width: number;
  height: number;
};

function frameToPixelCrop(
  crop: CropFrame,
  imageRect: { x: number; y: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number,
): PixelCrop {
  const scaleX = imageWidth / imageRect.width;
  const scaleY = imageHeight / imageRect.height;
  return {
    originX: (crop.x - imageRect.x) * scaleX,
    originY: (crop.y - imageRect.y) * scaleY,
    width: crop.width * scaleX,
    height: crop.height * scaleY,
  };
}

export default function CameraCaptureModal({
  visible,
  onCancel,
  onCaptured,
  onUnavailable,
}: CameraCaptureModalProps) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSavingCrop, setIsSavingCrop] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewSize, setPreviewSize] = useState<{ width?: number; height?: number }>({});
  const [stageLayout, setStageLayout] = useState<StageLayout>({ width: 0, height: 0 });
  const [crop, setCrop] = useState<CropFrame>({ x: 0, y: 0, width: 0, height: 0 });
  const [error, setError] = useState<string | null>(null);

  const imageWidth = previewSize.width ?? 0;
  const imageHeight = previewSize.height ?? 0;
  const imageRect = useMemo(
    () => getContainedImageRect(stageLayout.width, stageLayout.height, imageWidth, imageHeight),
    [imageHeight, imageWidth, stageLayout.height, stageLayout.width],
  );

  const cropInitKeyRef = useRef('');

  useEffect(() => {
    if (!visible) {
      setIsCapturing(false);
      setIsSavingCrop(false);
      setPreviewUri(null);
      setPreviewSize({});
      setCrop({ x: 0, y: 0, width: 0, height: 0 });
      setError(null);
      cropInitKeyRef.current = '';
      return;
    }
    if (!permission?.granted) {
      void requestPermission();
    }
  }, [visible, permission?.granted, requestPermission]);

  useEffect(() => {
    if (!previewUri || !stageLayout.width || !imageWidth || !imageHeight) {
      return;
    }
    const key = `${previewUri}:${stageLayout.width}x${stageLayout.height}:${imageWidth}x${imageHeight}`;
    if (cropInitKeyRef.current === key) {
      return;
    }
    cropInitKeyRef.current = key;
    setCrop(createDefaultCropFrame(getContainedImageRect(stageLayout.width, stageLayout.height, imageWidth, imageHeight)));
  }, [imageHeight, imageWidth, previewUri, stageLayout.height, stageLayout.width]);

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
      const prepared = await preparePhotoForCrop(photo.uri, photo.width, photo.height);
      let nextWidth = prepared.width ?? photo.width;
      let nextHeight = prepared.height ?? photo.height;
      if (!nextWidth || !nextHeight) {
        const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
          RNImage.getSize(prepared.uri, (width, height) => resolve({ width, height }), reject);
        });
        nextWidth = size.width;
        nextHeight = size.height;
      }
      setPreviewUri(prepared.uri);
      setPreviewSize({ width: nextWidth, height: nextHeight });
    } catch (captureError) {
      const message = captureError instanceof Error ? captureError.message : String(captureError);
      setError(message || 'No se pudo tomar la foto.');
    } finally {
      setIsCapturing(false);
    }
  };

  const resetPreview = () => {
    setPreviewUri(null);
    setPreviewSize({});
    setCrop({ x: 0, y: 0, width: 0, height: 0 });
    setError(null);
    cropInitKeyRef.current = '';
  };

  const emitPhoto = async (applyCrop: boolean) => {
    if (!previewUri || isSavingCrop) {
      return;
    }
    setIsSavingCrop(true);
    setError(null);
    try {
      const pixelCrop =
        applyCrop && imageWidth && imageHeight && crop.width > 0
          ? frameToPixelCrop(crop, imageRect, imageWidth, imageHeight)
          : undefined;
      const result = await cropAndCompressRemitoPhoto(previewUri, pixelCrop, {
        width: imageWidth,
        height: imageHeight,
      });
      onCaptured({
        uri: result.uri,
        width: result.width,
        height: result.height,
      });
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);
      setError(message || 'No se pudo recortar la foto.');
    } finally {
      setIsSavingCrop(false);
    }
  };

  const showCropEditor = Boolean(previewUri);

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.root}>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <Pressable onPress={onCancel} style={styles.headerButton} hitSlop={12}>
              <Ionicons name="close" size={26} color="#F2F5FB" />
            </Pressable>
            <Text style={styles.title}>{showCropEditor ? 'Recortar foto' : 'Foto de remito'}</Text>
            <View style={styles.headerButton} />
          </View>

          <View
            style={styles.stage}
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;
              setStageLayout((prev) =>
                prev.width === width && prev.height === height ? prev : { width, height },
              );
            }}>
            {previewUri ? (
              <>
                <Image source={{ uri: previewUri }} style={styles.preview} contentFit="contain" />
                {crop.width > 0 && imageWidth > 0 ? (
                  <ImageCropOverlay
                    containerWidth={stageLayout.width}
                    containerHeight={stageLayout.height}
                    imageWidth={imageWidth}
                    imageHeight={imageHeight}
                    crop={crop}
                    onCropChange={setCrop}
                  />
                ) : null}
              </>
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

            {(isCapturing || isSavingCrop) && (
              <View style={styles.capturingOverlay}>
                <ActivityIndicator color="#F2F5FB" size="large" />
                <Text style={styles.capturingText}>
                  {isSavingCrop ? 'Recortando foto…' : 'Preparando foto liviana…'}
                </Text>
              </View>
            )}
          </View>

          {showCropEditor ? (
            <Text style={styles.hintText}>Arrastrá el recuadro o agrandalo desde la esquina inferior derecha.</Text>
          ) : null}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.footer}>
            {showCropEditor ? (
              <View style={styles.cropActions}>
                <View style={styles.footerRow}>
                  <Pressable style={styles.secondaryButton} onPress={resetPreview} disabled={isSavingCrop}>
                    <Text style={styles.secondaryButtonText}>Repetir</Text>
                  </Pressable>
                  <Pressable
                    style={styles.primaryButton}
                    onPress={() => void emitPhoto(true)}
                    disabled={isSavingCrop}>
                    <Text style={styles.primaryButtonText}>Recortar</Text>
                  </Pressable>
                </View>
                <Pressable onPress={() => void emitPhoto(false)} disabled={isSavingCrop} hitSlop={8}>
                  <Text style={styles.skipCropText}>Usar sin recortar</Text>
                </Pressable>
              </View>
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
  hintText: {
    color: '#A0C4FF',
    textAlign: 'center',
    fontSize: 13,
    paddingHorizontal: 16,
    paddingTop: 10,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  cropActions: {
    width: '100%',
    alignItems: 'center',
    gap: 12,
  },
  footerRow: {
    width: '100%',
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
  skipCropText: {
    color: '#8A96AC',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
});
