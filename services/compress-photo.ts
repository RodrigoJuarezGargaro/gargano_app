export type CompressedPhoto = {
  uri: string;
  width?: number;
  height?: number;
};

export type PixelCrop = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

const EDITOR_MAX_WIDTH = 1600;
const MAX_PHOTO_WIDTH = 1280;
const JPEG_QUALITY = 0.5;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function sanitizePixelCrop(crop: PixelCrop, imageWidth: number, imageHeight: number): PixelCrop {
  const originX = clamp(Math.round(crop.originX), 0, Math.max(0, imageWidth - 1));
  const originY = clamp(Math.round(crop.originY), 0, Math.max(0, imageHeight - 1));
  const width = clamp(Math.round(crop.width), 1, imageWidth - originX);
  const height = clamp(Math.round(crop.height), 1, imageHeight - originY);
  return { originX, originY, width, height };
}

export async function preparePhotoForCrop(
  uri: string,
  width?: number,
  height?: number,
): Promise<CompressedPhoto> {
  if (width && width <= EDITOR_MAX_WIDTH) {
    return { uri, width, height };
  }

  try {
    const ImageManipulator = await import('expo-image-manipulator');
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: EDITOR_MAX_WIDTH } }],
      {
        compress: 0.7,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    );
    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
    };
  } catch (error) {
    console.warn('[compress-photo] No se pudo preparar la foto para recorte:', error);
    return { uri, width, height };
  }
}

export async function cropAndCompressRemitoPhoto(
  uri: string,
  crop?: PixelCrop,
  imageSize?: { width?: number; height?: number },
): Promise<CompressedPhoto> {
  try {
    const ImageManipulator = await import('expo-image-manipulator');
    const actions: Parameters<typeof ImageManipulator.manipulateAsync>[1] = [];

    if (crop) {
      const safeCrop =
        imageSize?.width && imageSize?.height
          ? sanitizePixelCrop(crop, imageSize.width, imageSize.height)
          : {
              originX: Math.max(0, Math.round(crop.originX)),
              originY: Math.max(0, Math.round(crop.originY)),
              width: Math.max(1, Math.round(crop.width)),
              height: Math.max(1, Math.round(crop.height)),
            };
      actions.push({ crop: safeCrop });
    }

    const sourceWidth = crop?.width ?? imageSize?.width;
    if (!sourceWidth || sourceWidth > MAX_PHOTO_WIDTH) {
      actions.push({ resize: { width: MAX_PHOTO_WIDTH } });
    }

    const result = await ImageManipulator.manipulateAsync(uri, actions, {
      compress: JPEG_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
    };
  } catch (error) {
    console.warn('[compress-photo] No se pudo recortar/comprimir, se usa la foto original:', error);
    return { uri };
  }
}

export async function compressRemitoPhoto(uri: string): Promise<CompressedPhoto> {
  return cropAndCompressRemitoPhoto(uri);
}
