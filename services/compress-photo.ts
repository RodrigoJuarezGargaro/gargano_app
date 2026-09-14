export type CompressedPhoto = {
  uri: string;
  width?: number;
  height?: number;
};

const MAX_PHOTO_WIDTH = 1280;
const JPEG_QUALITY = 0.5;

export async function compressRemitoPhoto(uri: string): Promise<CompressedPhoto> {
  try {
    const ImageManipulator = await import('expo-image-manipulator');
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: MAX_PHOTO_WIDTH } }],
      {
        compress: JPEG_QUALITY,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    );
    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
    };
  } catch (error) {
    console.warn('[compress-photo] No se pudo comprimir, se usa la foto original:', error);
    return { uri };
  }
}
