import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MapSheet } from '../src/ui/components/MapSheet';

// The library's mock drops the sheet's props; keep the last ones to check them.
let mockSheet: any;
jest.mock('@gorhom/bottom-sheet', () => {
  const real = jest.requireActual('@gorhom/bottom-sheet/mock');
  return { __esModule: true, ...real, default: (p: any) => ((mockSheet = p), p.children) };
});

test('sizes itself by its container, not the window (a tab bar takes the bottom)', async () => {
  await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 400, height: 900 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <MapSheet peekFraction={0.5} map={() => null} overlay={(c) => <Text testID="h">{`${c.height} ${c.peekHeight}`}</Text>} testID="sheet">
        <Text>places</Text>
      </MapSheet>
    </SafeAreaProvider>,
  );
  await fireEvent(screen.getByTestId('sheet'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 700 } } });
  expect(screen.getByTestId('h')).toHaveTextContent('700 350');
});

test('with a strip, the sheet goes down to it instead of away, and that counts as map only', async () => {
  await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 400, height: 900 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <MapSheet peekFraction={0.5} strip={64} map={() => null}>
        {(c) => <Text testID="c">{String(c.mapOnly)}</Text>}
      </MapSheet>
    </SafeAreaProvider>,
  );
  const sheet = mockSheet;
  expect(sheet.snapPoints).toEqual([64, expect.any(Number), expect.any(Number)]);
  expect(sheet.index).toBe(1);
  expect(sheet.enablePanDownToClose).toBe(false);
  expect(screen.getByTestId('c')).toHaveTextContent('false');
  await act(() => sheet.onChange(0));
  expect(screen.getByTestId('c')).toHaveTextContent('true');
});
