import { useEffect, useRef, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router } from 'expo-router';

export const palette = { screen: '#F4F5ED', ink: '#232820', muted: '#626C5D', forest: '#365C36', sage: '#DDE7D3', lime: '#D3EFBA', line: '#D9DFD1', soft: '#EBEEE3', amber: '#F1E4C5', red: '#F5DFD7' };
const icons = {
  back: require('../../assets/payment-icons/arrow-left.svg'), shield: require('../../assets/payment-icons/shield-check.svg'),
  leaf: require('../../assets/payment-icons/leaf.svg'), package: require('../../assets/payment-icons/package.svg'),
  receipt: require('../../assets/payment-icons/receipt-text.svg'), truck: require('../../assets/payment-icons/truck.svg'),
  heart: require('../../assets/payment-icons/heart-handshake.svg'), clock: require('../../assets/payment-icons/clock3.svg'),
  alert: require('../../assets/payment-icons/circle-alert.svg'), check: require('../../assets/payment-icons/check.svg'),
  card: require('../../assets/payment-icons/credit-card.svg'),
};
export type IconName = keyof typeof icons;
export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return <Image source={icons[name]} style={{ width: size, height: size }} contentFit="contain" accessible={false} />;
}
export function Copy({ children, kind = 'body', color, center = false, style, ...props }: { children?: ReactNode; kind?: 'body' | 'caption' | 'label' | 'heading' | 'display' | 'title'; color?: string; center?: boolean; style?: any; selectable?: boolean; accessibilityRole?: 'header' | 'text' }) {
  return <Text {...props} style={[s.text, s[kind], color ? { color } : null, center && { textAlign: 'center' }, style]}>{children}</Text>;
}
export function Button({ children, onPress, secondary = false, disabled = false, busy = false }: { children: ReactNode; onPress: () => void; secondary?: boolean; disabled?: boolean; busy?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [s.button, secondary && s.secondary, (disabled || busy) && { opacity: 0.55 }, pressed && { opacity: 0.8 }]}>
    {busy ? <ActivityIndicator color={secondary ? palette.ink : '#fff'} /> : <Copy kind="label" color={secondary ? palette.ink : '#fff'} style={{ fontFamily: 'InterSemiBold', fontSize: 16, textAlign: 'center' }}>{children}</Copy>}
  </Pressable>;
}
export function TextLink({ children, onPress }: { children: ReactNode; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={{ minHeight: 44, justifyContent: 'center' }}><Copy kind="label" color={palette.forest}>{children}</Copy></Pressable>;
}
export function Page({ title, subtitle, children, back, footer, resetKey, step }: { title: string; subtitle?: string; children?: ReactNode; back?: () => void; footer?: ReactNode; resetKey?: string; step?: number }) {
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [resetKey]);
  return <View style={s.outer}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[s.page, { paddingTop: insets.top }]}>
      <View style={s.topbar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={back || (() => router.replace('/more'))} style={s.back}><Icon name="back" size={18} /></Pressable>
        <Copy kind="heading" color={palette.forest} style={{ flex: 1 }}>suva voice</Copy><Icon name="shield" />
      </View>
      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {step ? <View style={{ gap: 18 }}>
          <View accessible accessibilityLabel={'Checkout step ' + step + ' of 4'} style={{ flexDirection: 'row', gap: 8 }}>{[1, 2, 3, 4].map(value => <View key={value} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: value <= step ? palette.forest : palette.line }} />)}</View>
          <Copy kind="caption" color={palette.forest}>{'0' + step + ' / 04  ·  ' + ['Review', 'Contact', 'Delivery', 'Payment'][step - 1]}</Copy>
        </View> : null}
        <View style={{ gap: 6 }}><Copy kind="display" accessibilityRole="header">{title}</Copy>{subtitle ? <Copy color={palette.muted}>{subtitle}</Copy> : null}</View>
        {children}
      </ScrollView>
      {footer ? <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>{footer}</View> : null}
    </KeyboardAvoidingView>
  </View>;
}
export function Card({ children, tone = 'white' }: { children: ReactNode; tone?: 'white' | 'sage' | 'soft' }) {
  return <View style={[s.card, { backgroundColor: tone === 'white' ? '#fff' : palette[tone] }]}>{children}</View>;
}
export function Divider() { return <View style={{ height: 1, backgroundColor: palette.line, width: '100%' }} />; }
export function Line({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
  return <View style={s.line}><Copy kind={strong ? 'heading' : 'label'} color={palette.muted} style={{ flex: 1 }}>{label}</Copy><Copy kind={strong ? 'heading' : 'label'} style={{ maxWidth: '62%', textAlign: 'right', flexShrink: 1 }}>{value}</Copy></View>;
}
export function Pill({ children, tone = 'sage' }: { children: ReactNode; tone?: 'sage' | 'lime' | 'amber' | 'red' | 'screen' }) {
  return <View style={{ alignSelf: 'flex-start', backgroundColor: palette[tone], borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7 }}><Copy kind="caption" color={tone === 'amber' || tone === 'red' ? palette.ink : palette.forest}>{children}</Copy></View>;
}
export function IconTile({ name, size = 44, tone = 'soft' }: { name: IconName; size?: number; tone?: keyof typeof palette }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: palette[tone], justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}><Icon name={name} size={size > 90 ? 44 : size > 60 ? 32 : 22} /></View>;
}
export function Info({ name, title, detail }: { name: IconName; title: string; detail: string }) {
  return <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><IconTile name={name} /><View style={{ flex: 1, gap: 4 }}><Copy kind="label">{title}</Copy><Copy kind="caption" color={palette.muted}>{detail}</Copy></View></View>;
}
export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  return <View style={{ gap: 7, flex: 1 }}><Copy kind="caption" color={palette.muted}>{label}</Copy><TextInput accessibilityLabel={label} placeholderTextColor="#7A8474" style={[s.input, Boolean(error) && { borderColor: '#A13B29' }]} autoCapitalize="none" {...props} />{error ? <Copy kind="caption" color="#913625">{error}</Copy> : null}</View>;
}
export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked }} onPress={onChange} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 44 }}>
    <View style={{ width: 20, height: 20, borderWidth: 1, borderColor: palette.muted, borderRadius: 4, backgroundColor: checked ? palette.ink : '#fff', alignItems: 'center', justifyContent: 'center' }}>{checked ? <Text style={{ color: '#fff', lineHeight: 18 }}>✓</Text> : null}</View>
    <Copy kind="caption" color={palette.muted} style={{ flex: 1 }}>{label}</Copy>
  </Pressable>;
}
export function Notice({ text, error = false }: { text?: string; error?: boolean }) {
  return text ? <View accessibilityLiveRegion="polite" style={{ backgroundColor: error ? palette.red : palette.soft, borderRadius: 16, padding: 14 }}><Copy kind="caption" color={error ? '#813525' : palette.muted}>{text}</Copy></View> : null;
}
export function Loading({ error, retry }: { error?: string; retry?: () => void }) {
  return error ? <><Notice text={error} error />{retry ? <Button secondary onPress={retry}>Try again</Button> : null}</> : <View style={{ paddingVertical: 45 }}><ActivityIndicator color={palette.forest} /><Copy center color={palette.muted} style={{ marginTop: 14 }}>Loading your details…</Copy></View>;
}
const s = StyleSheet.create({
  outer: { flex: 1, backgroundColor: '#E2E8DA', alignItems: 'center' },
  page: { flex: 1, width: '100%', maxWidth: 440, backgroundColor: palette.screen },
  topbar: { minHeight: 78, paddingHorizontal: 28, paddingTop: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 44, height: 44, backgroundColor: '#fff', borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 28, paddingTop: 10, paddingBottom: 28, gap: 18, flexGrow: 1 },
  footer: { paddingHorizontal: 28, paddingTop: 12, gap: 10, backgroundColor: palette.screen },
  text: { fontFamily: 'Inter', color: palette.ink, flexShrink: 1 },
  body: { fontSize: 15, lineHeight: 22 }, caption: { fontSize: 12, lineHeight: 18 },
  label: { fontSize: 14, lineHeight: 20, fontFamily: 'InterMedium' },
  heading: { fontSize: 18, lineHeight: 24, fontFamily: 'InterSemiBold' },
  display: { fontSize: 34, lineHeight: 40, fontFamily: 'InterMedium', letterSpacing: -0.6 },
  title: { fontSize: 26, lineHeight: 32, fontFamily: 'InterMedium' },
  button: { minHeight: 56, borderRadius: 99, paddingHorizontal: 20, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.ink },
  secondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: palette.line },
  card: { padding: 22, borderRadius: 26, gap: 18 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { borderWidth: 1, borderColor: palette.line, backgroundColor: '#fff', borderRadius: 16, minHeight: 52, paddingHorizontal: 15, paddingVertical: 14, fontFamily: 'Inter', fontSize: 15, color: palette.ink },
});
