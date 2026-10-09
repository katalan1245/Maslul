import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MapSheet } from '../src/ui/components/MapSheet';

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
