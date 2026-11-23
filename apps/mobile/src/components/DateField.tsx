import {MotionModal as Modal} from './MotionModal';
import {shopDay} from '../data/shopCalendar';
import {useState} from 'react';
import {Platform, Pressable, Text, View} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {useTheme} from '../theme/ThemeProvider';
import {dateOnly, parseDateOnly} from '../data/dateOnly';

/** Keep the existing YYYY-MM-DD contracts; choose a day with native platform controls. */
export function DateField({label, value, onChange, optional = false, disabled = false}: {
  label: string; value: string; onChange: (value: string) => void; optional?: boolean; disabled?: boolean;
}) {
  const {colors, dark} = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(new Date());
  const selected = parseDateOnly(value);
  const close = () => setOpen(false);
  const picker = <DateTimePicker value={draft} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
    locale="fr-BE" textColor={colors.text}
    themeVariant={dark ? 'dark' : 'light'} accentColor={colors.accent}
    onDismiss={close}
    onValueChange={(_event, date) => {
      if (Platform.OS !== 'ios') {close(); onChange(dateOnly(date));}
      else if (date) setDraft(date);
    }} />;
  return <View style={{gap: 6}}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} : ${selected ? selected.toLocaleDateString('fr-BE') : 'Non définie'}`}
      disabled={disabled} onPress={() => {setDraft(selected ?? parseDateOnly(shopDay()) ?? new Date()); setOpen(true);}}
      style={{minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 12, borderRadius: 12, backgroundColor: colors.surface, opacity: disabled ? 0.5 : 1}}>
      <Text style={{color: colors.text, flex: 1}}>{label}</Text>
      <Text style={{color: colors.accent}}>{selected ? selected.toLocaleDateString('fr-BE') : 'Choisir une date'} ›</Text>
    </Pressable>
    {optional && !!value && <Pressable accessibilityRole="button" accessibilityLabel={`Effacer ${label}`} disabled={disabled} onPress={() => onChange('')} style={{minHeight: 44, justifyContent: 'center'}}><Text style={{color: colors.accent}}>Effacer la date</Text></Pressable>}
    {open && (Platform.OS === 'ios' ? <Modal transparent animationType="fade" onRequestClose={close}>
      <View style={{flex: 1, justifyContent: 'center', padding: 20, backgroundColor: colors.overlay}}>
        <View accessibilityViewIsModal style={{backgroundColor: colors.surface, padding: 16, borderRadius: 20, gap: 12}}>
          <Text accessibilityRole="header" style={{color: colors.text, fontSize: 20, fontWeight: '600'}}>{label}</Text>
          {picker}
          <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
            <Pressable accessibilityRole="button" onPress={close} style={{minHeight: 44, justifyContent: 'center', paddingHorizontal: 12}}><Text style={{color: colors.accent}}>Annuler</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => {onChange(dateOnly(draft)); close();}} style={{minHeight: 44, justifyContent: 'center', paddingHorizontal: 12}}><Text style={{color: colors.accent, fontWeight: '600'}}>Choisir</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal> : picker)}
  </View>;
}
