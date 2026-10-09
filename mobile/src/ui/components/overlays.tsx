import { type ReactNode, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, useTheme } from '../theme';
import { S } from '../../i18n';
import { Txt } from './common';
import { Icon, type IconName } from './icons';

/** A modal sheet sliding up from the bottom (ModalBottomSheet in the Kotlin app). */
export function Sheet({ visible, onDismiss, children, testID }: { visible: boolean; onDismiss: () => void; children: ReactNode; testID?: string }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.32)' }]} onPress={onDismiss} accessibilityLabel={S.common.close} />
        <View style={[styles.sheet, { backgroundColor: t.c.surface, paddingBottom: insets.bottom + 24, maxHeight: '90%' }]} testID={testID}>
          <View style={[styles.handle, { backgroundColor: t.c.outline }]} />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20 }}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** A Material alert dialog. */
export function Dialog({
  visible,
  title,
  onDismiss,
  children,
  actions,
  testID,
}: {
  visible: boolean;
  title: string;
  onDismiss: () => void;
  children: ReactNode;
  actions: ReactNode;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.center}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.32)' }]} onPress={onDismiss} accessibilityLabel={S.common.close} />
        <View style={[styles.dialog, { backgroundColor: t.c.surfaceContainerHigh }]} testID={testID} accessibilityViewIsModal>
          <Txt v="headlineSmall" style={{ marginBottom: 12 }}>
            {title}
          </Txt>
          {children}
          <View style={styles.actions}>{actions}</View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export interface MenuItem {
  text: string;
  icon?: IconName;
  onPress: () => void;
  testID?: string;
}

/** A small menu of actions (DropdownMenu), shown near the top of the screen. */
export function Menu({ visible, onDismiss, items, testID }: { visible: boolean; onDismiss: () => void; items: MenuItem[]; testID?: string }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss} statusBarTranslucent>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel={S.common.close} />
      <View style={[styles.menu, { backgroundColor: t.c.surfaceContainer, top: insets.top + 56 }]} testID={testID}>
        {items.map((i) => (
          <Pressable
            key={i.text}
            onPress={() => {
              onDismiss();
              i.onPress();
            }}
            style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: alpha(t.c.onSurface, 0.08) }]}
            accessibilityRole="menuitem"
            testID={i.testID}
          >
            {i.icon && (
              <View style={{ marginRight: 12 }}>
                <Icon name={i.icon} size={22} color={t.c.onSurfaceVariant} />
              </View>
            )}
            <Txt v="bodyLarge" numberOfLines={1} style={{ flexShrink: 1 }}>
              {i.text}
            </Txt>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

// ---- Toasts --------------------------------------------------------------------------

type ToastListener = (text: string | null) => void;
let toastListener: ToastListener | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

/** A short message at the bottom of the screen (Toast in the Kotlin app). */
export function showToast(text: string) {
  toastListener?.(text);
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastListener?.(null), 2500);
}

export function ToastHost() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    toastListener = setText;
    return () => {
      toastListener = null;
    };
  }, []);
  if (text == null) return null;
  return (
    <View pointerEvents="none" style={[styles.toast, { bottom: insets.bottom + 72 }]} accessibilityLiveRegion="polite">
      <View style={[styles.toastBody, { backgroundColor: t.dark ? '#E8EAED' : '#2B313A' }]}>
        <Txt v="bodyMedium" color={t.dark ? '#0F1115' : '#FFFFFF'}>
          {text}
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 8 },
  handle: { width: 32, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16, opacity: 0.6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 420, borderRadius: 28, padding: 24 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' },
  menu: { position: 'absolute', right: 8, minWidth: 220, maxWidth: 320, borderRadius: 8, paddingVertical: 8, elevation: 8 },
  menuItem: { flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: 16 },
  toast: { position: 'absolute', left: 24, right: 24, alignItems: 'center' },
  toastBody: { borderRadius: 24, paddingHorizontal: 18, paddingVertical: 10 },
});
