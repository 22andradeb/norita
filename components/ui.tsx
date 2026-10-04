import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { PropsWithChildren, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { radius, useTheme } from '@/lib/theme';
import type { IconName, Level } from '@/lib/vitals';

// Shared, themed building blocks. Sizes favour readability: body text 17, touch targets ≥ 48.

export function Screen({
  children,
  overlay,
  edges = ['top'],
  padded = true,
}: PropsWithChildren<{ overlay?: ReactNode; edges?: ('top' | 'bottom')[]; padded?: boolean }>) {
  const t = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={edges}>
      <ScrollView
        contentContainerStyle={[padded && styles.screen, { paddingBottom: overlay ? 120 : 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {overlay}
    </SafeAreaView>
  );
}

type TextProps = PropsWithChildren<{ style?: StyleProp<TextStyle>; numberOfLines?: number }>;

export function Title({ children, style }: TextProps) {
  const t = useTheme();
  return (
    <Text style={[styles.title, { color: t.text }, style]} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Heading({ children, action }: PropsWithChildren<{ action?: ReactNode }>) {
  const t = useTheme();
  return (
    <View style={styles.headingRow}>
      <Text style={[styles.heading, { color: t.text }]} accessibilityRole="header">
        {children}
      </Text>
      {action}
    </View>
  );
}

export function Body({ children, muted, style, numberOfLines }: TextProps & { muted?: boolean }) {
  const t = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[styles.body, { color: muted ? t.muted : t.text }, style]}>
      {children}
    </Text>
  );
}

export function Caption({ children, style, numberOfLines }: TextProps) {
  const t = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[styles.caption, { color: t.muted }, style]}>
      {children}
    </Text>
  );
}

export function ErrorText({ children }: PropsWithChildren) {
  const t = useTheme();
  if (!children) return null;
  return (
    <Text style={[styles.body, { color: t.danger }]} accessibilityLiveRegion="polite">
      {children}
    </Text>
  );
}

export function Card({
  children,
  tone,
  style,
  onPress,
  accessibilityLabel,
}: PropsWithChildren<{
  tone?: 'warning' | 'danger' | 'primary';
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}>) {
  const t = useTheme();
  const bg = tone === 'danger' ? t.dangerSoft : tone === 'warning' ? t.warningSoft : tone === 'primary' ? t.primarySoft : t.card;
  const cardStyle = [styles.card, { backgroundColor: bg, borderColor: tone ? 'transparent' : t.border }, style];
  if (!onPress) return <View style={cardStyle}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [cardStyle, pressed && { opacity: 0.85 }]}
    >
      {children}
    </Pressable>
  );
}

export function Icon({ name, color, size = 22 }: { name: IconName; color?: string; size?: number }) {
  const t = useTheme();
  return <MaterialCommunityIcons name={name} size={size} color={color ?? t.text} accessible={false} />;
}

/** Icon inside a tinted circle, used to mark categories. */
export function IconBadge({ name, color, size = 40 }: { name: IconName; color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `${color}22`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <MaterialCommunityIcons name={name} size={size * 0.55} color={color} accessible={false} />
    </View>
  );
}

export function StatusPill({ level, label }: { level: Level | 'none'; label: string }) {
  const t = useTheme();
  const [bg, fg] =
    level === 'alert'
      ? [t.dangerSoft, t.danger]
      : level === 'watch'
        ? [t.warningSoft, t.warning]
        : level === 'normal'
          ? [t.successSoft, t.success]
          : [t.cardAlt, t.muted];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 13, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function Field({ label, style, ...props }: TextInputProps & { label: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.label, { color: t.text }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={t.muted}
        style={[styles.input, { borderColor: t.border, backgroundColor: t.card, color: t.text }, style]}
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
  icon,
  compact,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  compact?: boolean;
}) {
  const t = useTheme();
  const filled = variant === 'primary' || variant === 'danger';
  const bg = variant === 'primary' ? t.primary : variant === 'danger' ? t.danger : variant === 'secondary' ? t.card : 'transparent';
  const fg = filled ? t.onPrimary : t.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: loading, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        compact && { minHeight: 44, paddingHorizontal: 14 },
        { backgroundColor: bg, borderColor: variant === 'secondary' ? t.border : 'transparent' },
        pressed && { opacity: 0.8 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon ? <MaterialCommunityIcons name={icon} size={20} color={fg} accessible={false} /> : null}
          <Text style={[styles.buttonText, { color: fg }, compact && { fontSize: 16 }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Selectable pill used for choices; meets the 48pt touch target. */
export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconName;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        { borderColor: selected ? t.primary : t.border, backgroundColor: selected ? t.primary : t.card },
      ]}
    >
      {icon ? <MaterialCommunityIcons name={icon} size={18} color={selected ? t.onPrimary : t.text} /> : null}
      <Text style={[styles.chipText, { color: selected ? t.onPrimary : t.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: t.cardAlt }]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[styles.segment, on && { backgroundColor: t.card }]}
          >
            <Text style={{ fontSize: 15, fontWeight: on ? '700' : '500', color: on ? t.text : t.muted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Row({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.row, style]}>{children}</View>;
}

/** Floating "+" button for logging. */
export function Fab({ onPress, label }: { onPress: () => void; label: string }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.fab, { backgroundColor: t.primary }, pressed && { transform: [{ scale: 0.96 }] }]}
    >
      <MaterialCommunityIcons name="plus" size={32} color={t.onPrimary} />
    </Pressable>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  children,
}: PropsWithChildren<{ icon: IconName; title: string; body: string }>) {
  const t = useTheme();
  return (
    <Card style={{ alignItems: 'center', paddingVertical: 28, gap: 10 }}>
      <IconBadge name={icon} color={t.primary} size={56} />
      <Text style={[styles.heading, { color: t.text, textAlign: 'center' }]}>{title}</Text>
      <Body muted style={{ textAlign: 'center' }}>
        {body}
      </Body>
      {children ? <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 6 }}>{children}</View> : null}
    </Card>
  );
}

export function Loading() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, justifyContent: 'center', backgroundColor: t.bg }}>
      <ActivityIndicator size="large" color={t.primary} accessibilityLabel="Cargando" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 20, gap: 16 },
  title: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  heading: { fontSize: 21, fontWeight: '700', letterSpacing: -0.2 },
  body: { fontSize: 17, lineHeight: 24 },
  caption: { fontSize: 14, lineHeight: 19 },
  label: { fontSize: 16, fontWeight: '600' },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 8 },
  pill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  input: { minHeight: 52, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 18 },
  button: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  buttonText: { fontSize: 17, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipText: { fontSize: 16, fontWeight: '600' },
  segmented: { flexDirection: 'row', borderRadius: radius.md, padding: 4 },
  segment: { flex: 1, minHeight: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
