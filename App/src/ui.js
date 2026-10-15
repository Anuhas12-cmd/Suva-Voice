import { useState } from 'react';
import { Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text as RNText, TextInput, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { label, tone } from './format';

export const colors = {
  teal: '#129688',
  tealDark: '#0b6158',
  tealDeep: '#083f3b',
  mint: '#e7f6f3',
  cream: '#fbf6f1',
  paper: '#f4f8f6',
  coral: '#f26b4a',
  ink: '#1c2c32',
  muted: '#5f727c',
  line: '#d7e6e1',
  white: '#ffffff',
  good: '#1f9d55',
  warn: '#d97706',
  bad: '#e14b45'
};

function weightOf(style) {
  const flat = StyleSheet.flatten(style) || {};
  if (flat.fontWeight === 'bold') return 700;
  const number = Number(flat.fontWeight);
  return Number.isFinite(number) ? number : 600;
}

export function Text({ style, ...props }) {
  const heavy = weightOf(style) >= 700;
  const family = heavy ? 'NunitoBold' : 'Nunito';
  return <RNText {...props} style={[{ fontFamily: family, color: colors.ink, fontSize: 15 }, style, { fontFamily: family, fontWeight: 'normal' }]} />;
}

export function Screen({ children, tabs, tab, go }) {
  const { width } = useWindowDimensions();
  const columnWidth = Math.min(width, 460);
  return (
    <SafeAreaView style={styles.frame}>
      <View style={[styles.column, { width: columnWidth }]}>
        <ScrollView style={styles.scroller} contentContainerStyle={[styles.page, tabs && styles.pageWithTabs]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        {tabs ? <TabBar tab={tab} go={go} /> : null}
      </View>
    </SafeAreaView>
  );
}

export function Title({ children, sub }) {
  return (
    <View style={{ marginBottom: 4 }}>
      <RNText style={styles.h1}>{children}</RNText>
      {sub ? <RNText style={styles.sub}>{sub}</RNText> : null}
    </View>
  );
}

export function Section({ title, action, onPress }) {
  return (
    <View style={styles.section}>
      <RNText style={styles.sectionTitle}>{title}</RNText>
      {action ? (
        <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}>
          <RNText style={styles.link}>{action}</RNText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Card({ children, toneName }) {
  return <View style={[styles.card, toneName === 'alert' && styles.alertCard]}>{children}</View>;
}

export function Stat({ label: labelText, value, hint, alert }) {
  return (
    <View style={[styles.stat, alert && styles.statAlert]}>
      <RNText style={styles.statLabel}>{labelText}</RNText>
      <RNText style={styles.statValue} numberOfLines={1}>{value}</RNText>
      {hint ? <RNText style={styles.meta} numberOfLines={1}>{hint}</RNText> : null}
    </View>
  );
}

export function Action({ source, label: labelText, onPress }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.action}>
      <Image source={source} style={styles.actionImage} resizeMode="cover" />
      <RNText style={styles.actionLabel}>{labelText}</RNText>
    </Pressable>
  );
}

export function Row({ title, meta, value, onPress, alert }) {
  const initial = String(title || 'S').trim().charAt(0).toUpperCase();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.row, alert && styles.alertCard]}>
      <View style={[styles.mark, alert && styles.markAlert]}>
        <RNText style={styles.markText}>{initial}</RNText>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <RNText style={styles.rowTitle} numberOfLines={1}>{title}</RNText>
        {meta ? <RNText style={styles.meta} numberOfLines={1}>{meta}</RNText> : null}
      </View>
      {value ? <Badge value={value} /> : null}
    </Pressable>
  );
}

export function PersonCard({ name, meta, value, onPress }) {
  const initial = String(name || 'S').trim().charAt(0).toUpperCase();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.personCard}>
      <View style={styles.mark}>
        <RNText style={styles.markText}>{initial}</RNText>
      </View>
      <RNText style={styles.rowTitle} numberOfLines={1}>{name}</RNText>
      <RNText style={styles.meta} numberOfLines={1}>{meta}</RNText>
      <Badge value={value} />
    </Pressable>
  );
}

export function Field({ labelText, value, onChangeText, secure, keyboard, placeholder, error }) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <RNText style={[styles.label, error && styles.labelError]}>{labelText}</RNText>
      <View>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={Boolean(secure) && !visible}
          keyboardType={keyboard || 'default'}
          placeholder={placeholder}
          placeholderTextColor="#8aa099"
          autoCapitalize="none"
          style={[styles.input, error && styles.inputError, secure && styles.inputSecure]}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Hide password' : 'Show password'}
            onPress={() => setVisible((current) => !current)}
            style={styles.reveal}
            hitSlop={8}
          >
            <RNText style={styles.revealText}>{visible ? 'Hide' : 'Show'}</RNText>
          </Pressable>
        ) : null}
      </View>
      {error ? <RNText style={styles.fieldError}>{error}</RNText> : null}
    </View>
  );
}

export function Btn({ children, onPress, kind = 'primary', disabled }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.btn, kind === 'secondary' && styles.secondary, kind === 'danger' && styles.danger, kind === 'ghost' && styles.ghost, disabled && { opacity: 0.6 }]}>
      <RNText style={[styles.btnText, kind !== 'primary' && kind !== 'danger' && styles.btnTextDark]}>{children}</RNText>
    </Pressable>
  );
}

export function Badge({ value }) {
  const name = tone(value);
  const palette = {
    good: { bg: '#e7f7ee', fg: colors.good },
    warn: { bg: '#fff4e5', fg: colors.warn },
    bad: { bg: '#fdecee', fg: colors.bad },
    info: { bg: colors.mint, fg: colors.tealDark }
  }[name];
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <RNText style={{ color: palette.fg, fontFamily: 'NunitoBold', fontSize: 12 }}>{label(value)}</RNText>
    </View>
  );
}

export function Notice({ text, bad }) {
  if (!text) return null;
  return <RNText style={[styles.notice, bad && styles.noticeBad]}>{text}</RNText>;
}

export function Back({ onPress }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.back}><RNText style={styles.link}>← Back</RNText></Pressable>;
}

export function Art({ source, compact }) {
  return <Image source={source} style={compact ? styles.artCompact : styles.art} resizeMode="cover" />;
}

export function Empty({ text }) {
  return <RNText style={styles.empty}>{text}</RNText>;
}

export function Chips({ options, value, onChange }) {
  return (
    <View style={styles.chips}>
      {options.map(([key, name]) => {
        const on = value === key;
        return (
          <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(key)} style={[styles.chip, on && styles.chipOn]}>
            <RNText style={[styles.chipText, on && styles.chipTextOn]}>{name}</RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function LinkRow({ children, onPress }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.linkRow}>
      <RNText style={styles.linkRowText}>{children}</RNText>
      <RNText style={styles.chevron}>›</RNText>
    </Pressable>
  );
}

export function Logo({ compact }) {
  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <Image source={require('../assets/icon.png')} style={compact ? styles.logoCompact : styles.logo} resizeMode="contain" accessibilityLabel="Suva Voice" />
      {compact ? null : <RNText style={styles.sub}>Care. Connect. Protect.</RNText>}
    </View>
  );
}

function TabBar({ tab, go }) {
  const items = [
    ['home', 'Home', 'home', 'home-outline'],
    ['loved', 'Loved', 'people', 'people-outline'],
    ['orders', 'Orders', 'basket', 'basket-outline'],
    ['alerts', 'Alerts', 'notifications', 'notifications-outline'],
    ['more', 'More', 'grid', 'grid-outline']
  ];
  return (
    <View style={styles.tabs}>
      {items.map(([key, name, filled, outline]) => {
        const on = tab === key;
        return (
          <Pressable key={key} accessibilityRole="button" accessibilityLabel={name} onPress={() => go(key)} style={styles.tab}>
            <View style={[styles.tabIcon, on && styles.tabIconOn]}>
              <Ionicons name={on ? filled : outline} size={18} color={on ? colors.white : colors.muted} />
            </View>
            <RNText style={[styles.tabText, on && styles.tabTextOn]}>{name}</RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.paper, alignItems: 'center' },
  column: { flex: 1, backgroundColor: colors.paper },
  scroller: { flex: 1 },
  page: { flexGrow: 1, backgroundColor: colors.paper, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, gap: 10 },
  pageWithTabs: { paddingBottom: 118 },
  h1: { fontFamily: 'Fraunces', fontSize: 30, color: colors.tealDeep, letterSpacing: -0.6 },
  sub: { fontFamily: 'Nunito', color: colors.muted, fontSize: 14, marginTop: 4, lineHeight: 20 },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  sectionTitle: { fontFamily: 'Fraunces', fontSize: 22, color: colors.tealDeep },
  card: {
    backgroundColor: colors.white, borderRadius: 22, padding: 14, gap: 8,
    borderWidth: 1, borderColor: '#fff',
    shadowColor: '#124842', shadowOpacity: 0.08, shadowRadius: 16, elevation: 2
  },
  alertCard: { backgroundColor: '#fff6f3', borderColor: '#ffd2c8' },
  stat: { flex: 1, backgroundColor: colors.white, borderRadius: 20, padding: 12, gap: 2, minHeight: 86, justifyContent: 'center' },
  statAlert: { backgroundColor: '#fff1ec' },
  statLabel: { fontFamily: 'NunitoBold', fontSize: 12, color: colors.muted },
  statValue: { fontFamily: 'Fraunces', fontSize: 22, color: colors.tealDeep },
  action: { flex: 1, backgroundColor: colors.white, borderRadius: 20, padding: 8, alignItems: 'center', gap: 4 },
  actionImage: { width: '100%', height: 64, borderRadius: 14, backgroundColor: colors.cream },
  actionLabel: { fontFamily: 'NunitoBold', fontSize: 13, color: colors.tealDeep },
  row: {
    backgroundColor: colors.white, borderRadius: 18, minHeight: 64, paddingHorizontal: 10, paddingVertical: 8,
    flexDirection: 'row', alignItems: 'center', gap: 10
  },
  personCard: {
    width: 148, backgroundColor: colors.white, borderRadius: 20, padding: 12, gap: 4
  },
  mark: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  markAlert: { backgroundColor: '#fdecee' },
  markText: { fontFamily: 'Fraunces', fontSize: 18, color: colors.tealDark },
  rowTitle: { fontFamily: 'NunitoBold', fontSize: 15, color: colors.ink },
  meta: { fontFamily: 'Nunito', fontSize: 12, color: colors.muted },
  label: { fontFamily: 'NunitoBold', color: colors.ink, fontSize: 14 },
  input: { fontFamily: 'Nunito', backgroundColor: colors.cream, borderWidth: 1, borderColor: colors.line, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.ink },
  inputSecure: { paddingRight: 72 },
  inputError: { borderColor: colors.bad, backgroundColor: '#fff6f7' },
  labelError: { color: colors.bad },
  fieldError: { fontFamily: 'NunitoBold', color: colors.bad, fontSize: 13 },
  reveal: { position: 'absolute', right: 6, top: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: 10 },
  revealText: { fontFamily: 'NunitoBold', color: colors.tealDark, fontSize: 14 },
  btn: { backgroundColor: colors.teal, borderRadius: 999, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  secondary: { backgroundColor: colors.mint },
  danger: { backgroundColor: colors.coral },
  ghost: { backgroundColor: 'transparent', minHeight: 40 },
  btnText: { fontFamily: 'NunitoBold', color: 'white', fontSize: 16 },
  btnTextDark: { color: colors.tealDark },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  notice: { fontFamily: 'NunitoBold', backgroundColor: '#e7f7ee', color: '#146c3a', borderRadius: 16, padding: 12, overflow: 'hidden' },
  noticeBad: { backgroundColor: '#fdecee', color: '#9f2430' },
  link: { fontFamily: 'NunitoBold', color: colors.teal, fontSize: 14 },
  back: { alignSelf: 'flex-start', backgroundColor: colors.white, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  logo: { width: 120, height: 120, borderRadius: 32 },
  logoCompact: { width: 72, height: 72, borderRadius: 22 },
  art: { width: '100%', height: 180, borderRadius: 22, backgroundColor: colors.cream },
  artCompact: { width: '100%', height: 96, borderRadius: 18 },
  empty: { fontFamily: 'Nunito', color: colors.muted, fontSize: 14, lineHeight: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: colors.white, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.line },
  chipOn: { backgroundColor: colors.teal, borderColor: colors.teal },
  chipText: { fontFamily: 'NunitoBold', color: colors.tealDark, fontSize: 14 },
  chipTextOn: { color: 'white' },
  linkRow: {
    backgroundColor: colors.white, borderRadius: 18, minHeight: 52, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'
  },
  linkRowText: { fontFamily: 'NunitoBold', fontSize: 15, color: colors.ink },
  chevron: { fontFamily: 'Nunito', color: colors.teal, fontSize: 22 },
  tabs: {
    position: 'absolute', left: 14, right: 14, bottom: 10, backgroundColor: colors.white,
    borderRadius: 28, flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 4,
    borderWidth: 1, borderColor: '#e7f1ee',
    shadowColor: '#083f3b', shadowOpacity: 0.16, shadowRadius: 18, elevation: 8
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 2 },
  tabIcon: { width: 40, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tabIconOn: { backgroundColor: colors.teal },
  tabText: { fontFamily: 'NunitoBold', fontSize: 10, color: colors.muted },
  tabTextOn: { color: colors.tealDark }
});
