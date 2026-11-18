import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { usePagedData } from '../data/usePagedData';
import { readRecord } from '../data/apiRepository';
import { Pagination } from './Pagination';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Seller } from '../data/apiRepository';

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr');
export function ClientPicker({
  clients,
  value,
  onChange,
  onCreate,
  onResolved,
  label = 'Déposant',
}: {
  clients: Seller[];
  value: string;
  onChange: (id: string) => void;
  onCreate: () => void;
  onResolved?: (client: Seller) => void;
  label?: string;
}) {
  const [search, setSearch] = useState('');
  const [resolved, setResolved] = useState<Seller | null>(null);
  const data = usePagedData<Seller>('/sellers', { search: search.trim(), size: 10 }, !value && search.trim().length >= 2);
  const selected = clients.find(client => client._id === value) ?? (resolved?._id === value ? resolved : null);
  useEffect(() => { let active = true; if (value && !selected) void readRecord<Seller>('/sellers', value).then(client => { if (active) { setResolved(client); onResolved?.(client); } }).catch(() => {}); return () => { active = false; }; }, [value]);
  const matches = data.items;
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      {selected ? (
        <View style={styles.selected}>
          <View style={styles.mark}>
            <Ionicons name="person" size={17} color="#143d59" />
          </View>
          <View style={styles.flex}>
            <Text style={styles.name}>{selected.name}</Text>
            <Text style={styles.hint}>
              {[selected.email, selected.phone].filter(Boolean).join(' · ') ||
                'Coordonnées non renseignées'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Changer de déposant"
            style={styles.change}
            onPress={() => {
              onChange('');
              setSearch('');
            }}
          >
            <Text style={styles.actionText}>Changer</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.search}>
            <Ionicons name="search-outline" size={19} color="#60727e" />
            <TextInput
              accessibilityLabel="Rechercher le déposant"
              value={search}
              onChangeText={setSearch}
              placeholder="Nom, e-mail ou téléphone"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            {!!search && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Effacer la recherche client"
                onPress={() => setSearch('')}
              >
                <Ionicons name="close-circle" size={19} color="#60727e" />
              </Pressable>
            )}
          </View>
          {matches.map((client) => (
            <Pressable
              key={client._id}
              accessibilityRole="button"
              style={styles.result}
              onPress={() => {
                setResolved(client); onResolved?.(client); onChange(client._id);
                setSearch('');
              }}
            >
              <View style={styles.flex}>
                <Text style={styles.name}>{client.name}</Text>
                <Text style={styles.hint}>
                  {[client.email, client.phone].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#60727e" />
            </Pressable>
          ))}
          <Text style={styles.hint}>{search.trim().length < 2 ? 'Saisissez au moins 2 caractères.' : !data.loading && !matches.length ? (data.nextCursor ? 'Aucun résultat sur cette page. Continuez la recherche.' : 'Aucun client trouvé sur cette page.') : ''}</Text>
          {search.trim().length >= 2 && <Pagination data={data} />}
          <Pressable accessibilityRole="button" onPress={onCreate} style={styles.create}>
            <Text style={styles.actionText}>Créer une fiche client</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  label: { fontWeight: '600', marginBottom: 8, color: '#263238' },
  flex: { flex: 1 },
  name: { fontWeight: '700', color: '#152b3a' },
  hint: { color: '#60727e', fontSize: 12, marginVertical: 5 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    minHeight: 48,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#cbd5dc',
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  input: { flex: 1, paddingVertical: 10, color: '#152b3a', fontSize: 15 },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e3e8ec',
    borderRadius: 9,
    backgroundColor: '#fbfcfd',
  },
  selected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#adc6d4',
    borderRadius: 10,
    backgroundColor: '#edf5f9',
  },
  mark: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: '#dbeaf2',
  },
  change: { paddingVertical: 7, paddingHorizontal: 9, borderRadius: 8, backgroundColor: '#fff' },
  actionText: { color: '#164f73', fontSize: 12, fontWeight: '700' },
  create: {
    padding: 13,
    alignItems: 'center',
    borderRadius: 9,
    marginVertical: 8,
    backgroundColor: '#e3e9ed',
  },
});
