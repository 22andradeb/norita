import type { PropsWithChildren } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Caregivers fill this in quickly between visits and family members may be older themselves:
// keep text large, contrast high (WCAG AA) and touch targets at least 48pt.
export const colors = {
  bg: '#FFFFFF',
  text: '#1A1A1A',
  muted: '#555555',
  primary: '#0B5FA5',
  onPrimary: '#FFFFFF',
  border: '#8A8A8A',
  divider: '#E2E2E2',
  surface: '#F4F6F8',
  danger: '#B3261E',
  dangerBg: '#FDECEA',
  warning: '#7A4B00',
  warningBg: '#FFF4E0',
};

export function Screen({ children }: PropsWithChildren) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Title({ children }: PropsWithChildren) {
  return (
    <Text style={styles.title} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Body({ children, muted }: PropsWithChildren<{ muted?: boolean }>) {
  return <Text style={[styles.body, muted && { color: colors.muted }]}>{children}</Text>;
}

export function ErrorText({ children }: PropsWithChildren) {
  if (!children) return null;
  return (
    <Text style={styles.error} accessibilityLiveRegion="polite">
      {children}
    </Text>
  );
}

export function Field({ label, style, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={[styles.input, style]}
        {...props}
      />
    </View>
  );
}

export function Button({
  title,
  onPress,
  loading,
  variant = 'primary',
  selected,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
  selected?: boolean;
}) {
  const primary = variant === 'primary' || selected;
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: loading, selected }}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        pressed && { opacity: 0.8 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? colors.onPrimary : colors.primary} />
      ) : (
        <Text style={[styles.buttonText, { color: primary ? colors.onPrimary : colors.primary }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Heading({ children }: PropsWithChildren) {
  return (
    <Text style={styles.heading} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Card({ children, tone }: PropsWithChildren<{ tone?: 'warning' | 'danger' }>) {
  const toneStyle =
    tone === 'danger'
      ? { backgroundColor: colors.dangerBg, borderColor: colors.danger }
      : tone === 'warning'
        ? { backgroundColor: colors.warningBg, borderColor: colors.warning }
        : null;
  return <View style={[styles.card, toneStyle]}>{children}</View>;
}

/** Selectable pill used for choices; meets the 48pt touch target. */
export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && { color: colors.onPrimary }]}>{label}</Text>
    </Pressable>
  );
}

export function Row({ children }: PropsWithChildren) {
  return <View style={styles.row}>{children}</View>;
}

export function Loading() {
  return (
    <View style={[styles.safe, { justifyContent: 'center' }]}>
      <ActivityIndicator size="large" color={colors.primary} accessibilityLabel="Loading" />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  screen: { padding: 24, gap: 16 },
  title: { fontSize: 28, fontWeight: '700', color: colors.text },
  body: { fontSize: 18, lineHeight: 26, color: colors.text },
  error: { fontSize: 16, color: colors.danger },
  field: { gap: 6 },
  label: { fontSize: 16, fontWeight: '600', color: colors.text },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 18,
    color: colors.text,
  },
  button: {
    minHeight: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonSecondary: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.bg },
  buttonText: { fontSize: 18, fontWeight: '600' },
  heading: { fontSize: 21, fontWeight: '700', color: colors.text, marginTop: 8 },
  card: {
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.bg,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.primary },
  chipText: { fontSize: 17, fontWeight: '600', color: colors.primary },
});
