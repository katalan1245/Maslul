/**
 * Simple Maslul (upstream 1.2.0): upstream's SimpleModeTest, and the whole flow run offline:
 * switching to it, setting a button's address, the routes, the steps, and back to the full app.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import App from '../src/App';
import { type Itinerary, makeLeg } from '../src/data/models';
import { zoned } from '../src/data/time';
import { DEFAULT_SIMPLE_BUTTONS, EMPTY_USER_DATA, Edits, SIMPLE_ICONS, simpleSlots } from '../src/data/userStore';
import { en } from '../src/i18n/en';
import { he } from '../src/i18n/he';
import { ru } from '../src/i18n/ru';
import { STORE_KEY, MIGRATED_KEY } from '../src/state/persist';
import { store } from '../src/state/store';
import { simpleSteps } from '../src/ui/simple/steps';
import { call, instant } from './helpers';

jest.mock('../src/state/services', () => ({ repo: require('./support/fakeRepo').makeFakeRepo() }));

describe('SimpleModeTest', () => {
  const home = { name: 'Herzl 10', lat: 31.25, lon: 34.79, kind: 'HOME' as const };
  const kids = { name: 'Weizmann 3', lat: 32.08, lon: 34.78, kind: 'POI' as const };

  it('names the default buttons in every language', () => {
    expect(DEFAULT_SIMPLE_BUTTONS).toHaveLength(5);
    for (const s of [en, he, ru]) for (const ic of SIMPLE_ICONS) expect(s.simple.iconName[ic].trim()).not.toBe('');
    expect(he.simple.iconName[DEFAULT_SIMPLE_BUTTONS[1].icon]).toBe('הנכדים');
  });

  it('home and work buttons fall back to saved places', () => {
    const d = { ...EMPTY_USER_DATA, home };
    const slots = simpleSlots(d);
    expect(slots[0].place).toEqual(home);
    expect(slots[1].place).toBeNull();
    expect(slots[2].place).toBeNull();
    expect(simpleSlots(Edits.setSimpleButton(d, 1, { ...d.simpleButtons[1], place: kids }))[1].place).toEqual(kids);
    // Out of range is ignored.
    expect(Edits.setSimpleButton(d, 9, { icon: 'STAR', label: '', place: null })).toBe(d);
  });

  const t0 = instant('2026-10-09T08:00:00Z');
  const at = (min: number) => t0 + min * 60;
  const stop = (name: string, track: string | null = null) => ({ ...call(`s${name}`, name, 32.0, 34.8), track });
  const leg = (mode: 'WALK' | 'BUS' | 'TRAIN', from: ReturnType<typeof stop>, to: ReturnType<typeof stop>, start: number, end: number, line: string | null = null, stops = 0, alternatives: ReturnType<typeof makeLeg>[] = []) =>
    makeLeg({ mode, from, to, start: at(start), end: at(end), headsign: 'Central Station', routeShortName: line, tripId: line ? `trip-${line}-${start}` : null, intermediateStops: Array.from({ length: stops }, (_, i) => stop(`mid${i}`)), alternatives });

  it('steps walk, ride and arrive', () => {
    const other = leg('BUS', stop('A'), stop('B'), 8, 20, '22');
    const itin: Itinerary = {
      id: 'x', start: at(0), end: at(28), transfers: 1,
      legs: [
        leg('WALK', stop('here'), stop('A'), 0, 5),
        leg('BUS', stop('A', '3'), stop('B'), 5, 15, '18', 6, [other]),
        // Crossing to the platform: too short to mention.
        leg('WALK', stop('B'), stop('C'), 15, 15),
        leg('TRAIN', stop('C'), stop('D'), 18, 25, null, 0),
        leg('WALK', stop('D'), stop('there'), 25, 28),
      ],
    };
    const steps = simpleSteps(itin);
    expect(steps).toHaveLength(5);
    expect(steps[0]).toEqual({ kind: 'walkToStop', stop: 'A', minutes: 5 });
    expect(steps[1]).toMatchObject({ kind: 'ride', line: '18', others: ['22'], platform: '3', stops: 7, getOff: 'B' });
    expect(steps[2]).toMatchObject({ kind: 'ride', line: '', stops: 1 });
    expect(steps[3]).toEqual({ kind: 'walkToEnd', minutes: 3 });
    expect(steps[4]).toEqual({ kind: 'arrive', at: at(28) });
  });

  it('words rides in each language', () => {
    expect(en.simple.take('BUS', '18')).toBe('Take bus 18');
    expect(en.simple.take('TRAIN', '')).toBe('Take train');
    expect(he.simple.take('BUS', '18')).toBe('לעלות על אוטובוס 18');
    expect(ru.simple.rideStops(3)).toBe('Проедьте 3 остановки');
    expect(ru.simple.changes(2)).toBe('2 пересадки');
  });

  it('says later days plainly', () => {
    expect(en.simple.leaveOn(null, '17:59')).toBe('Leave tomorrow at 17:59');
    expect(en.simple.leaveOn(7, '08:00')).toBe('Leave on Sunday at 08:00');
    expect(he.simple.leaveOn(6, '20:10')).toBe('צאו בשבת ב־20:10');
    expect(ru.simple.leaveOn(2, '07:15')).toBe('Выходите во вторник в 07:15');
  });
});

describe('the app in Simple Maslul', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('switches over from Settings, only after confirming', async () => {
    await render(<App />);
    await fireEvent.press(await screen.findByTestId('settings_button'));
    await fireEvent.press(await screen.findByTestId('simple_switch'));
    await fireEvent.press(await screen.findByText('Cancel'));
    expect(store.value.settings.simpleMode).toBe(false);
    await fireEvent.press(screen.getByTestId('simple_switch'));
    await fireEvent.press(await screen.findByTestId('simple_confirm'));
    // No tab bar: its own home.
    await screen.findByText('Where are you going?');
    expect(screen.queryByTestId('tab_lines')).toBeNull();
  });

  it('sets a button, plans from here, shows plain steps, and goes back to the full app', async () => {
    await AsyncStorage.setItem(MIGRATED_KEY, '1');
    await AsyncStorage.setItem(STORE_KEY, JSON.stringify({ settings: { simpleMode: true } }));
    await render(<App />);
    await screen.findByText('Where are you going?');
    expect(screen.getAllByText('Tap to choose the address')).toHaveLength(5);

    // An unset button asks for its address first, then keeps it.
    await fireEvent.press(screen.getByTestId('simple_slot_1'));
    await screen.findByText('Where is “Grandkids”?');
    await fireEvent.changeText(screen.getByTestId('simple_search_field'), 'dizengoff');
    await fireEvent.press(await screen.findByText('Dizengoff Center', {}, { timeout: 2000 }));
    await screen.findByText('Where are you going?');
    expect(store.value.simpleButtons[1].place?.name).toBe('Dizengoff Center');

    await fireEvent.press(screen.getByTestId('simple_slot_1'));
    await screen.findByText('To Grandkids');
    const options = await screen.findAllByTestId('simple_option');
    expect(options.length).toBeGreaterThan(0);
    expect(screen.getByText('Best')).toBeTruthy();
    expect(screen.getAllByText(/^Leave in \d+ min$/).length).toBeGreaterThan(0);

    await fireEvent.press(options[0]);
    await screen.findByText('How to get there');
    expect(screen.getByText('Walk to the stop “Arlozorov/Ibn Gabirol”')).toBeTruthy();
    expect(screen.getByText('Take bus 5')).toBeTruthy();
    expect(screen.getByText('Get off at “Dizengoff Center”')).toBeTruthy();
    expect(screen.getByText("You're there!")).toBeTruthy();

    await fireEvent.press(screen.getByTestId('simple_back'));
    await fireEvent.press(screen.getByTestId('simple_back'));
    await fireEvent.press(await screen.findByTestId('simple_settings'));
    await fireEvent.press(await screen.findByTestId('simple_full_app'));
    await fireEvent.press(await screen.findByTestId('simple_full_confirm'));
    await screen.findByText('Where to?');
    expect(store.value.settings.simpleMode).toBe(false);
  });

  it('edits a button: name, picture and address', async () => {
    await AsyncStorage.setItem(MIGRATED_KEY, '1');
    await AsyncStorage.setItem(STORE_KEY, JSON.stringify({ settings: { simpleMode: true } }));
    await render(<App />);
    await fireEvent.press(await screen.findByTestId('simple_settings'));
    await fireEvent.press(await screen.findByTestId('simple_edit_3'));
    await fireEvent.changeText(screen.getByTestId('simple_edit_name'), ' Mom ');
    await fireEvent.press(screen.getByLabelText('Café'));
    await fireEvent.press(screen.getByTestId('simple_edit_address'));
    await fireEvent.changeText(await screen.findByTestId('simple_search_field'), 'azrieli');
    await fireEvent.press(await screen.findByText('Azrieli Center', {}, { timeout: 2000 }));
    await waitFor(() => expect(screen.getByTestId('simple_edit_dialog')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('simple_edit_save'));
    expect(store.value.simpleButtons[3]).toMatchObject({ icon: 'CAFE', label: ' Mom ', place: { name: 'Azrieli Center' } });
    await fireEvent.press(screen.getByTestId('simple_back'));
    expect(await screen.findByText('Mom')).toBeTruthy();
  });

  it('says when the next bus is another day', () => {
    const { leaveText } = require('../src/ui/simple/SimpleScreens') as typeof import('../src/ui/simple/SimpleScreens');
    const friday = zoned('2026-10-09', 17);
    expect(leaveText(friday + 20, friday)).toBe('Leave now');
    expect(leaveText(friday + 6 * 60, friday)).toBe('Leave in 6 min');
    expect(leaveText(friday + 2 * 3600, friday)).toBe('Leave at 19:00');
    expect(leaveText(zoned('2026-10-10', 20, 10), friday)).toBe('Leave tomorrow at 20:10');
    expect(leaveText(zoned('2026-10-11', 8), friday)).toBe('Leave on Sunday at 08:00');
  });
});
