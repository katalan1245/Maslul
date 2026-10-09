import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { type ReactNode, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { type SharedValue, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

export interface SheetControls {
  /** The sheet is dragged all the way down (or hidden): the map is on its own. */
  mapOnly: boolean;
  show: () => void;
  hide: () => void;
  /** Collapses an expanded sheet to its peek height (e.g. to show a followed vehicle). */
  peek: () => void;
  /** Where the sheet's top edge is, in px from the top of the layout. */
  position: SharedValue<number>;
  height: number;
  peekHeight: number;
}

/**
 * A full-screen map with a sheet over it that can be dragged up, down to a peek, or away to show
 * the map on its own (BottomSheetScaffold in the Kotlin app).
 */
export function MapSheet({
  peekFraction,
  peekMax,
  topGap = 80,
  map,
  overlay,
  children,
  scroll = true,
  testID,
}: {
  /** Peek height as a share of the screen, capped at [peekMax]. */
  peekFraction: number;
  peekMax?: number;
  /** Space kept above the fully expanded sheet (for a search card or a back button). */
  topGap?: number;
  map: (c: SheetControls) => ReactNode;
  overlay?: (c: SheetControls) => ReactNode;
  children: ReactNode;
  /** Wraps [children] in the sheet's scroll view; off when they bring their own sheet list. */
  scroll?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const sheet = useRef<BottomSheet>(null);
  const [index, setIndex] = useState(0);
  const position = useSharedValue(height);
  const peekHeight = Math.min(height * peekFraction, peekMax ?? Infinity);
  const max = Math.max(height - insets.top - topGap, peekHeight + 1);
  const controls: SheetControls = {
    mapOnly: index === -1,
    show: () => sheet.current?.snapToIndex(0),
    hide: () => sheet.current?.close(),
    peek: () => {
      if (index > 0) sheet.current?.snapToIndex(0);
    },
    position,
    height,
    peekHeight,
  };
  return (
    <View style={styles.fill} testID={testID}>
      {map(controls)}
      {overlay?.(controls)}
      <BottomSheet
        ref={sheet}
        index={0}
        snapPoints={[peekHeight, max]}
        enableDynamicSizing={false}
        enablePanDownToClose
        animatedPosition={position}
        onChange={setIndex}
        backgroundStyle={{ backgroundColor: t.c.surface }}
        handleIndicatorStyle={{ backgroundColor: t.c.outline }}
        style={styles.shadow}
      >
        {scroll ? <BottomSheetScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 8 }}>{children}</BottomSheetScrollView> : children}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  shadow: {
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
  },
});
