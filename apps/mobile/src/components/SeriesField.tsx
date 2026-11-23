import {useEffect, useRef, useState, type ComponentRef} from 'react';
import {Pressable, Text, TextInput, View} from 'react-native';
import {seriesKey} from '../../../../packages/domain/src/seriesFilter';
import {markUserActivity} from '../auth/session';
import {useStockSeries, type SeriesTcg} from '../data/useStockSeries';
import {useTheme} from '../theme/ThemeProvider';

/** Selecting a suggestion is the only operation that replaces the user's text. */
export function SeriesField({value, onChangeText, tcg, compact = false}: {
  value: string; onChangeText: (value: string) => void; tcg: SeriesTcg; compact?: boolean;
}) {
  const {colors, dark} = useTheme();
  const [focused, setFocused] = useState(false);
  const blur = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const suggestions = useStockSeries(tcg, true);
  useEffect(() => () => clearTimeout(blur.current), []);
  useEffect(() => { setFocused(false); input.current?.blur(); }, [tcg]);
  const choices = suggestions.series.filter(label => seriesKey(label).includes(seriesKey(value))).slice(0, 8);
  return <View style={{padding: compact ? 12 : 0, gap: 8}}>
    <Text style={{color: colors.text, fontSize: 15, fontWeight: '500'}}>Série / extension</Text>
    <TextInput ref={input} accessibilityLabel="Série / extension" value={value}
      onChangeText={text => { markUserActivity(); onChangeText(text); }}
      onFocus={() => { clearTimeout(blur.current); setFocused(true); }}
      onBlur={() => { blur.current = setTimeout(() => setFocused(false), 180); }}
      maxLength={300} keyboardAppearance={dark ? 'dark' : 'light'} autoCorrect={false}
      placeholder="Saisie libre ou série connue" placeholderTextColor={colors.placeholder}
      style={{minHeight: 48, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10, color: colors.text, backgroundColor: colors.surface, fontSize: 17}} />
    {focused && <View>
      {suggestions.loading && <Text style={{color: colors.secondary}}>Chargement des séries…</Text>}
      {!!suggestions.error && <><Text accessibilityRole="alert" style={{color: colors.danger}}>{suggestions.error}</Text><Pressable accessibilityRole="button" onPress={suggestions.reload} style={{minHeight: 44, justifyContent: 'center'}}><Text style={{color: colors.accent}}>Réessayer les séries</Text></Pressable></>}
      {!suggestions.loading && !suggestions.error && !choices.length && <Text style={{color: colors.secondary}}>Aucune série connue correspondante. La saisie reste libre.</Text>}
      {choices.map(label => <Pressable key={label} accessibilityRole="button" accessibilityLabel={`Compléter avec ${label}`}
        onPressIn={() => clearTimeout(blur.current)}
        onPress={() => { markUserActivity(); onChangeText(label); setFocused(false); input.current?.blur(); }}
        onPressOut={() => { if (!input.current?.isFocused()) blur.current = setTimeout(() => setFocused(false), 180); }}
        style={{minHeight: 44, padding: 10, justifyContent: 'center', borderBottomWidth: 1, borderColor: colors.border}}><Text style={{color: colors.accent}}>{label}</Text></Pressable>)}
    </View>}
  </View>;
}
