import { useCallback, useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

export type CropFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ContainedImageRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Recorte vertical tipo remito, igual al aspect [3, 4] anterior. */
export const CROP_ASPECT = 3 / 4;

const MIN_CROP_WIDTH = 96;
const HANDLE_SIZE = 28;

export function getContainedImageRect(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number,
): ContainedImageRect {
  if (!containerWidth || !containerHeight || !imageWidth || !imageHeight) {
    return { x: 0, y: 0, width: containerWidth, height: containerHeight };
  }
  const scale = Math.min(containerWidth / imageWidth, containerHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height,
  };
}

export function createDefaultCropFrame(imageRect: ContainedImageRect): CropFrame {
  const maxWidth = imageRect.width;
  const maxHeight = imageRect.height;
  let width = maxWidth * 0.9;
  let height = width / CROP_ASPECT;
  if (height > maxHeight * 0.9) {
    height = maxHeight * 0.9;
    width = height * CROP_ASPECT;
  }
  return {
    x: imageRect.x + (imageRect.width - width) / 2,
    y: imageRect.y + (imageRect.height - height) / 2,
    width,
    height,
  };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type ImageCropOverlayProps = {
  containerWidth: number;
  containerHeight: number;
  imageWidth: number;
  imageHeight: number;
  crop: CropFrame;
  onCropChange: (crop: CropFrame) => void;
};

export default function ImageCropOverlay({
  containerWidth,
  containerHeight,
  imageWidth,
  imageHeight,
  crop,
  onCropChange,
}: ImageCropOverlayProps) {
  const imageRect = useMemo(
    () => getContainedImageRect(containerWidth, containerHeight, imageWidth, imageHeight),
    [containerWidth, containerHeight, imageWidth, imageHeight],
  );
  const cropRef = useRef(crop);
  const startRef = useRef(crop);
  const modeRef = useRef<'move' | 'resize'>('move');
  cropRef.current = crop;

  const clampCrop = useCallback(
    (next: CropFrame): CropFrame => {
      const width = clamp(next.width, MIN_CROP_WIDTH, imageRect.width);
      const height = width / CROP_ASPECT;
      const maxHeight = imageRect.height;
      const safeHeight = Math.min(height, maxHeight);
      const safeWidth = safeHeight * CROP_ASPECT;
      const x = clamp(next.x, imageRect.x, imageRect.x + imageRect.width - safeWidth);
      const y = clamp(next.y, imageRect.y, imageRect.y + imageRect.height - safeHeight);
      return { x, y, width: safeWidth, height: safeHeight };
    },
    [imageRect],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          modeRef.current =
            locationX >= cropRef.current.width - HANDLE_SIZE * 1.6 &&
            locationY >= cropRef.current.height - HANDLE_SIZE * 1.6
              ? 'resize'
              : 'move';
          startRef.current = cropRef.current;
        },
        onPanResponderMove: (_, gesture) => {
          if (modeRef.current === 'resize') {
            onCropChange(
              clampCrop({
                ...startRef.current,
                width: startRef.current.width + gesture.dx,
                height: (startRef.current.width + gesture.dx) / CROP_ASPECT,
              }),
            );
            return;
          }
          onCropChange(
            clampCrop({
              ...startRef.current,
              x: startRef.current.x + gesture.dx,
              y: startRef.current.y + gesture.dy,
            }),
          );
        },
      }),
    [clampCrop, onCropChange],
  );

  const top = crop.y;
  const left = crop.x;
  const right = Math.max(0, containerWidth - crop.x - crop.width);
  const bottom = Math.max(0, containerHeight - crop.y - crop.height);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={[styles.dim, { height: top }]} pointerEvents="none" />
      <View style={[styles.middleRow, { height: crop.height }]} pointerEvents="box-none">
        <View style={[styles.dim, { width: left }]} pointerEvents="none" />
        <View style={[styles.cropBox, { width: crop.width, height: crop.height }]} {...panResponder.panHandlers}>
          <View style={styles.gridRow}>
            <View style={styles.gridLine} />
            <View style={styles.gridLine} />
          </View>
          <View style={styles.gridCol}>
            <View style={styles.gridLineVertical} />
            <View style={styles.gridLineVertical} />
          </View>
          <View style={styles.handle} />
        </View>
        <View style={[styles.dim, { width: right }]} pointerEvents="none" />
      </View>
      <View style={[styles.dim, { height: bottom }]} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  dim: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  middleRow: {
    flexDirection: 'row',
  },
  cropBox: {
    borderWidth: 2,
    borderColor: '#F2F5FB',
    backgroundColor: 'transparent',
  },
  gridRow: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-evenly',
  },
  gridCol: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
  },
  gridLine: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(242, 245, 251, 0.45)',
  },
  gridLineVertical: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(242, 245, 251, 0.45)',
  },
  handle: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRightWidth: 4,
    borderBottomWidth: 4,
    borderColor: '#F2F5FB',
  },
});
