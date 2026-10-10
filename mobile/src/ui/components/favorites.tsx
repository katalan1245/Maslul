import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { type Place } from '../../data/models';
import { S } from '../../i18n';
import { FAVORITE_ICONS, type FavoriteIcon, type FavoritePlace, favoriteFor, favoriteKey } from '../../data/userStore';
import { store } from '../../state/store';
import { alpha, inputType, useTheme } from '../theme';
import { TextButton, Txt } from './common';
import { FAVORITE_ICON_NAMES, Icon } from './icons';
import { Dialog } from './overlays';

export const FAVORITE_GOLD = '#F5A524';

/** A place being added to (or edited in) the favourites; drives the favourite dialog. */
export interface FavoriteDraft {
  place: Place;
  existing: FavoritePlace | null;
}

export const draftFor = (p: Place): FavoriteDraft => ({ place: p, existing: favoriteFor(store.value, p) });

/** Shows the label/icon editor for [draft] (if any) and writes the result to the store. */
export function FavoriteDialogHost({ draft, onClose }: { draft: FavoriteDraft | null; onClose: () => void }) {
  if (draft == null) return null;
  return <FavoriteDialog key={draft.place.name + draft.place.lat + draft.place.lon} draft={draft} onClose={onClose} />;
}

function FavoriteDialog({ draft, onClose }: { draft: FavoriteDraft; onClose: () => void }) {
  const t = useTheme();
  const initial = draft.existing?.label ?? draft.place.name;
  const [label, setLabel] = useState(initial);
  const [icon, setIcon] = useState<FavoriteIcon>(draft.existing?.icon ?? 'STAR');
  const save = () => {
    store.saveFavorite(draft.place, label, icon);
    onClose();
  };
  const existing = draft.existing;
  return (
    <Dialog
      visible
      title={existing == null ? S.favorites.save : S.favorites.edit}
      onDismiss={onClose}
      testID="favorite_dialog"
      actions={
        <>
          {existing != null && (
            <TextButton
              text={S.home.remove}
              color={t.c.error}
              onPress={() => {
                store.removeFavorite(favoriteKey(existing));
                onClose();
              }}
            />
          )}
          <TextButton text={S.common.cancel} onPress={onClose} />
          <TextButton text={S.common.save} onPress={save} testID="favorite_save" />
        </>
      }
    >
      <Txt v="bodyMedium" color={t.x.subtle} numberOfLines={2}>
        {[draft.place.name, draft.place.subtitle].filter((x) => x != null).join(' · ')}
      </Txt>
      <TextInput
        value={label}
        onChangeText={setLabel}
        autoFocus
        selectTextOnFocus
        placeholder={S.favorites.placeholder}
        placeholderTextColor={t.x.subtle}
        returnKeyType="done"
        onSubmitEditing={save}
        autoCapitalize="sentences"
        accessibilityLabel={S.favorites.label}
        testID="favorite_label"
        style={[inputType('bodyLarge'), styles.input, { color: t.c.onSurface, borderColor: t.c.outline }]}
      />
      <View style={styles.icons}>
        {FAVORITE_ICONS.map((i) => {
          const on = i === icon;
          return (
            <Pressable
              key={i}
              onPress={() => setIcon(i)}
              accessibilityLabel={S.favorites.icons[i]}
              accessibilityState={{ selected: on }}
              style={[
                styles.iconChoice,
                { backgroundColor: on ? t.c.primaryContainer : t.c.surfaceVariant },
                on && { borderWidth: 2, borderColor: t.c.primary },
              ]}
            >
              <Icon name={FAVORITE_ICON_NAMES[i]} size={20} color={on ? t.c.onPrimaryContainer : t.c.onSurfaceVariant} />
            </Pressable>
          );
        })}
      </View>
    </Dialog>
  );
}

/** Star toggle on a search result: saved favourites are gold. */
export function FavoriteStar({ saved, onPress }: { saved: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityLabel={saved ? S.favorites.edit : S.favorites.saveAs} style={{ padding: 8 }}>
      <Icon name={saved ? 'star' : 'star-border'} size={20} color={saved ? FAVORITE_GOLD : alpha(t.x.subtle, 1)} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  input: { marginTop: 12, borderWidth: 1, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 10 },
  icons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  iconChoice: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
