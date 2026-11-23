import {completeGiftExport,giftPageQuery} from '../data/giftExport';
import {creationBackTarget} from '../navigation/creationBack';
import {MotionModal as Modal} from './MotionModal';
import {captureAccountScope,getSessionScope} from '../auth/session';
import type {AttemptContext} from '../data/submittedAttempt';
import {shopDay,shopDayTimestamp} from '../data/shopCalendar';
import {costCsv, summarizeGiftCosts} from '../data/inventoryCosts';
import {DateField} from './DateField';
import { formatShopMoney, formatShopDate, shopCurrency } from '../theme/shopFormatting';
import { GradingCompanyPicker } from './PurchaseEditor';
import { useEffect, useRef, useState, type ReactNode, type ComponentRef } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { useTheme } from '../theme/ThemeProvider';
import { Field } from './Field';
import { AttachmentPreview } from './AttachmentPreview';
import { ItemThumbnail } from './ItemThumbnail';
import { Pagination } from './Pagination';
import { MultiPhotoPicker } from './MultiPhotoPicker';
import { ProductEditor } from './ProductEditor';
import { ProductProfitPreview } from './ProductProfitPreview';
import { usePagedData } from '../data/usePagedData';
import {
  request,shareCsvFile,
  finishFinancialAttempt,
  uploadCurrentFinancialFiles,
  uploadAttachment,
  openAttachment,
  type Item,
  type Attachment,
  type AttachmentFile,
} from '../data/apiRepository';

export function InventoryButton({
  label,
  onPress,
  disabled = false,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 48,
        padding: 12,
        borderRadius: 12,
        marginVertical: 4,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: secondary ? colors.raised : colors.accent,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text
        style={{
          fontSize: 16,
          fontWeight: '600',
          color: secondary ? colors.accent : colors.onAccent,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
function Panel({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        padding: 16,
        borderRadius: 16,
        marginVertical: 8,
        gap: 8,
      }}
    >
      {children}
    </View>
  );
}
function Copy({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <Text style={{ color: colors.text, fontSize: 15 }}>{children}</Text>;
}
function SectionHeading({ title, detail }: { title: string; detail?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 4, marginBottom: 6 }}>
      <Text
        accessibilityRole="header"
        style={{ color: colors.text, fontSize: 19, fontWeight: '600' }}
      >
        {title}
      </Text>
      {!!detail && (
        <Text style={{ color: colors.secondary, fontSize: 14, lineHeight: 20 }}>{detail}</Text>
      )}
    </View>
  );
}
function SupplierProgress({ step }: { step: number }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityLabel={`Étape ${step + 1} sur 3 : ${['Facture', 'Produits', 'Vérification'][step]}`}
      style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}
    >
      {['Facture', 'Produits', 'Vérification'].map((label, index) => (
        <View key={label} style={{ flex: 1, gap: 7 }}>
          <View
            style={{
              height: 4,
              borderRadius: 2,
              backgroundColor: index <= step ? colors.accent : colors.border,
            }}
          />
          <Text
            style={{
              color: index === step ? colors.accent : colors.secondary,
              fontSize: 12,
              fontWeight: index === step ? '700' : '400',
            }}
          >
            {index + 1} · {label}
          </Text>
        </View>
      ))}
    </View>
  );
}
const cents = (value: string) => {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim()))
    throw new Error('Montant invalide. Utilisez au maximum deux décimales.');
  const n = Math.round(Number(value.replace(',', '.')) * 100);
  if (!Number.isSafeInteger(n)) throw new Error('Montant trop élevé.');
  return n;
};
const count = (value: string) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw new Error('Indiquez une quantité entière positive.');
  return n;
};
const today = shopDay;
function timestamp(value: string) {
  const result=shopDayTimestamp(value);
  if(result===undefined)throw new Error('Date invalide (AAAA-MM-JJ).');
  return result;
}
const money = (n: number | null | undefined) => n == null ? 'Non renseigné' : formatShopMoney(n / 100);
type Product = {
  tcg?: Item['tcg'];
  name: string;
  productType: 'card' | 'sealed' | 'other';
  format?: Item['format'];
  packSize?: number;
  series?: string;
  identifier?: string;
  language?: Item['language'];
  condition?: Item['condition'];
  gradingCompany?: Item['gradingCompany'];
  gradingGrade?: string;
  gradingCertificate?: string;
  askingPriceCents: number;
  taxRateBps: number;
};
type Line = {
  itemId?: string;
  product: Product;
  quantity: number;
  unitCostCents: number;
  photos: AttachmentFile[];
};
type Gift = {
  _id: string;
  itemName: string;
  quantity: number;
  occurredAt: number;
  recipient?: string;
  reason: string;
  note?: string;
  costCents?: number | null;
  reversalAvailable?: boolean;
  cancelledAt?: number;
  purchaseReference?: string;
  lotSources: { reference?: string; supplier?: string; quantity: number; costCents: number | null }[];
};
type Page<T> = { page: T[]; continueCursor: string; isDone: boolean };
type Details = {
  item: Item;
  photos: Attachment[];
  lots: {
    _id: string;
    remaining: number;
    remainingCostCents: number | null;
    receipt?: { supplier: string; reference: string } | null;
  }[];
  openings: { _id: string; quantity: number; packSize: number; cancelledAt?: number; reversalAvailable?: boolean }[];
};
function ProductPicker({ onPick, onClose }: { onPick: (item: Item) => void; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const data = usePagedData<Item>('/stock', { search, origin: 'supplier', status: 'all' });
  return (
    <Panel>
      <Copy>Choisir une fiche existante (même variante et même taux de TVA)</Copy>
      <Field label="Rechercher" value={search} onChangeText={setSearch} />
      <Pagination data={data} />
      {data.items.map((i) => (
        <InventoryButton
          key={i._id}
          secondary
          label={`${i.name} · ${i.quantity ?? 0} en stock`}
          onPress={() => onPick(i)}
        />
      ))}
      <InventoryButton secondary label="Fermer la sélection" onPress={onClose} />
    </Panel>
  );
}
export function InventoryManager({
  item,
  onChanged,
}: {
  item?: Item;
  onChanged: () => Promise<void>;
}) {
  const { colors,reduceMotion } = useTheme();
  const [mode, setMode] = useState<
    'supplier' | 'gift' | 'opening' | 'photos' | 'gifts' | 'receipts' | null
  >(null);
  const [editingProduct, setEditingProduct] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const supplierScroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const lock = useRef(false),
    attempts = useRef(new Map<string, string>());
  const [details, setDetails] = useState<Details | null>(null),
    [step, setStep] = useState(0),
    [picker, setPicker] = useState(false);
  const [supplier, setSupplier] = useState(''),
    [reference, setReference] = useState(''),
    [date, setDate] = useState(today()),
    [lines, setLines] = useState<Line[]>([]);
  const [tcg, setTcg] = useState<NonNullable<Item['tcg']>>('pokemon');
  const [existing, setExisting] = useState<Item | null>(null),
    [name, setName] = useState(''),
    [kind, setKind] = useState<Product['productType']>('sealed'),
    [format, setFormat] = useState<Item['format']>('display');
  const [series, setSeries] = useState(''),
    [identifier, setIdentifier] = useState(''),
    [language, setLanguage] = useState<NonNullable<Item['language']>>('fr'),
    [condition, setCondition] = useState<NonNullable<Item['condition']>>('NM');
  const [gradingCompany, setGradingCompany] = useState<Item['gradingCompany']>(),
    [grade, setGrade] = useState(''),
    [certificate, setCertificate] = useState('');
  const [quantity, setQuantity] = useState('1'),
    [cost, setCost] = useState(''),
    [price, setPrice] = useState(''),
    [rate, setRate] = useState(''),
    [pack, setPack] = useState(String(item?.packSize ?? 36));
  const [photos, setPhotos] = useState<AttachmentFile[]>([]),
    [invoice, setInvoice] = useState<AttachmentFile | null>(null),
    [newPhotos, setNewPhotos] = useState<AttachmentFile[]>([]);
  const [saved, setSaved] = useState<{ id: string; itemIds: string[] } | null>(null),
    [uploaded, setUploaded] = useState<string[]>([]);
  const [recipient, setRecipient] = useState(''),
    [reason, setReason] = useState(''),
    [note, setNote] = useState(''),
    [giftAttachment, setGiftAttachment] = useState<AttachmentFile | null>(null),
    [savedGift, setSavedGift] = useState<string | null>(null);
  const [from, setFrom] = useState(today().slice(0, 7) + '-01'),
    [to, setTo] = useState(today()),
    [gifts, setGifts] = useState<Gift[]>([]),
    [cursor, setCursor] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Attachment[]>([]);
  const [receipts, setReceipts] = useState<
    {
      _id: string;
      supplier: string;
      reference: string;
      totalCostCents: number | null;
      itemIds: string[];
    }[]
  >([]);
  function operation(path: string, body: Record<string, unknown>, context:AttemptContext={}) {
    return request<{ result: any }>(path, {
      ...body,
      operationId: Crypto.randomUUID(),
    },'POST',context);
  }
  async function upload(
    target: 'itemId' | 'supplierReceiptId' | 'giftId',
    id: string,
    file: AttachmentFile,
  ) {
    const key = JSON.stringify(['attachment', target, id, file.uri]);
    if (!attempts.current.has(key)) attempts.current.set(key, Crypto.randomUUID());
    return uploadAttachment(target, id, file, attempts.current.get(key));
  }
  async function run(action: () => Promise<void>) {
    const epoch=getSessionScope();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (e) {
      if(epoch!==getSessionScope())return;
      setError(e instanceof Error ? e.message : 'Opération impossible. Réessayez.');
      if (mode === 'supplier') supplierScroll.current?.scrollTo({ y: 0, animated: !reduceMotion });
    } finally {
      if(epoch===getSessionScope()){lock.current = false;setBusy(false);}
    }
  }
  async function loadDetails() {
    if (item) setDetails(await request<Details>(`/stock/${item._id}/lots`));
  }
  useEffect(() => {
    if (mode && item) void run(loadDetails);
  }, [mode, item?._id]);
  useEffect(() => {
    setNewPhotos([]);
    setDetails(null);
  }, [item?._id]);
  async function showEvidence(kind: 'receiptId' | 'giftId', id: string) {
    setEvidence(
      await request<Attachment[]>('/inventory/evidence?' + kind + '=' + encodeURIComponent(id)),
    );
  }
  function close() {
    if(busy)return;
    const finish=()=>{setEvidence([]);setMode(null);setError('');setMessage('');setPicker(false);};
    if(mode==='supplier'&&(supplier.trim()||reference.trim()||date!==today()||lines.length||invoice||productInProgress)) {
      Alert.alert('Fermer la réception ?',saved?'La réception est enregistrée. Les pièces restantes sont accessibles dans « Opérations à vérifier ».':'Votre saisie reste en mémoire tant que ce compte reste ouvert. Elle n’est pas encore enregistrée dans le stock.',[{text:'Continuer la saisie',style:'cancel'},{text:'Fermer',onPress:finish}]);
    }else finish();
  }
  function goBack() {
    const target=creationBackTarget(mode==='supplier'?step:0,busy,!!saved);
    if(target.kind==='close'){close();return;}
    if(target.kind==='step'){Keyboard.dismiss();setStep(target.step);setError('');setMessage('');supplierScroll.current?.scrollTo({y:0,animated:false});}
  }
  function pick(i: Item) {
    setExisting(i);
    setName(i.name);
    setTcg(i.tcg ?? 'pokemon');
    setKind(i.productType ?? 'card');
    setFormat(i.format);
    setSeries(i.series ?? '');
    setIdentifier(i.identifier ?? '');
    setLanguage(i.language ?? 'fr');
    setCondition(i.condition ?? 'NM');
    setGradingCompany(i.gradingCompany);
    setGrade(i.gradingGrade ?? '');
    setCertificate(i.gradingCertificate ?? '');
    setRate(String((i.taxRateBps ?? 0) / 100));
    setPrice(String((i.askingPriceCents ?? 0) / 100));
    setPicker(false);
  }
  function resetProductFields() {
    setExisting(null);
    setName('');
    setTcg('pokemon');
    setKind('sealed');
    setFormat('display');
    setSeries('');
    setIdentifier('');
    setLanguage('fr');
    setCondition('NM');
    setGradingCompany(undefined);
    setGrade('');
    setCertificate('');
    setQuantity('1');
    setCost('');
    setPrice('');
    setRate('');
    setPack('36');
    setPhotos([]);
    setPicker(false);
  }
  function product(): Product {
    if (!name.trim()) throw new Error('Indiquez le nom du produit.');
    return {
      name: name.trim(),
      tcg,
      productType: kind,
      ...(kind === 'sealed'
        ? { format: format ?? 'other', ...(format === 'display' ? { packSize: count(pack) } : {}) }
        : {}),
      series,
      identifier,
      language,
      ...(kind === 'card'
        ? {
            condition,
            ...(gradingCompany
              ? { gradingCompany, gradingGrade: grade, gradingCertificate: certificate }
              : {}),
          }
        : {}),
      askingPriceCents: cents(price),
      taxRateBps: cents(rate),
    };
  }
  async function loadGifts(next?: string) {
    const page:Page<Gift>=await request(`/gifts?${giftPageQuery(from,to,next)}`);
    setGifts(next?gifts.concat(page.page):page.page);setCursor(page.isDone?null:page.continueCursor);
  }
  async function exportGifts() {
    const scope=await captureAccountScope();scope.assertActive();
    const rows=await completeGiftExport<Gift>(cursor=>request<Page<Gift>>(`/gifts?${giftPageQuery(from,to,cursor)}`),scope.assertActive);
    const escape = (v: unknown) =>
      '"' +
      String(v ?? '')
        .replace(/^[=+@-]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const csv =
      '\uFEFF' +
      [
        [
          'Date',
          'Article',
          'Quantité',
          'Bénéficiaire',
          'Motif',
          'Note',
          `Coût connu ${shopCurrency()}`,
          'Référence achat',
          'Fournisseur',
          'Statut',
        ],
        ...rows.map((g) => [
          shopDay(g.occurredAt),
          g.itemName,
          g.quantity,
          g.recipient,
          g.reason,
          g.note,
          costCsv(g.costCents),
          g.purchaseReference || g.lotSources.map((s) => s.reference).join(' / '),
          g.lotSources.map((s) => s.supplier).join(' / '),
          g.cancelledAt ? 'Annulé' : 'Actif',
        ]),
        [
          '',
          'TOTAL COÛTS CONNUS (DONS ACTIFS)',
          '',
          '',
          '',
          '',
          (
            summarizeGiftCosts(rows).knownCents / 100
          ).toFixed(2),
          '',
          '',
          '',
        ],
        [
          '',
          'DONS ACTIFS AU COÛT INCONNU',
          summarizeGiftCosts(rows).unknownCount,
          '',
          '',
          '',
          '',
          '',
          '',
          '',
        ],
      ]
        .map((r) => r.map(escape).join(';'))
        .join('\r\n');
    await shareCsvFile(`dons-${Date.now()}.csv`,csv,scope);
  }
  const supplierTotal = lines.reduce((sum, line) => sum + line.quantity * line.unitCostCents, 0);
  const supplierUnits = lines.reduce((sum, line) => sum + line.quantity, 0);
  const supplierPhotoCapacity = Math.max(
    0,
    6 -
      (existing?.photos?.filter((photo) => photo.contentType.startsWith('image/')).length ?? 0) -
      (existing
        ? lines
            .filter((line) => line.itemId === existing._id)
            .reduce((sum, line) => sum + line.photos.length, 0)
        : 0),
  );
  const productInProgress = !!(
    existing ||
    name.trim() ||
    series.trim() ||
    identifier.trim() ||
    cost ||
    price ||
    rate ||
    photos.length ||
    grade ||
    certificate
  );
  function validateSupplier() {
    if (!supplier.trim()) throw new Error('Indiquez le nom du fournisseur.');
    if (!reference.trim()) throw new Error('Indiquez la référence de la facture.');
    if (supplier.length > 200 || reference.length > 200)
      throw new Error('Le fournisseur et la référence sont limités à 200 caractères.');
    timestamp(date);
  }
  function supplierStep(next: number) {
    if (next > 0) validateSupplier();
    if (next === 2) {
      if (!lines.length) throw new Error('Ajoutez au moins un produit à cette réception.');
      if (productInProgress)
        throw new Error(
          'Ajoutez le produit en cours avec « Ajouter à la réception » avant de vérifier.',
        );
    }
    Keyboard.dismiss();
    setStep(next);
    setError('');
    setMessage('');
    supplierScroll.current?.scrollTo({ y: 0, animated: !reduceMotion });
  }
  function addSupplierLine() {
    if (lines.length >= 50) throw new Error('Une réception peut contenir au maximum 50 produits.');
    if (photos.length > supplierPhotoCapacity)
      throw new Error(
        'Ce produit est limité à six photos, y compris celles des autres lignes de la réception.',
      );
    const nextProduct = product();
    if (
      nextProduct.name.length > 300 ||
      series.length > 300 ||
      identifier.length > 100 ||
      grade.length > 32 ||
      certificate.length > 100
    )
      throw new Error(
        'Le nom ou les détails du produit sont trop longs. Raccourcissez les champs avant de continuer.',
      );
    const units = count(quantity),
      unitCost = cents(cost);
    if (units > 100000) throw new Error('La quantité est limitée à 100 000 unités.');
    if (nextProduct.taxRateBps > 10000)
      throw new Error('Le taux de TVA doit être compris entre 0 et 100 %.');
    if (nextProduct.packSize !== undefined && nextProduct.packSize > 1000)
      throw new Error('Un display peut contenir au maximum 1 000 boosters.');
    if (!Number.isSafeInteger(units * unitCost + supplierTotal))
      throw new Error('Le montant total est trop élevé.');
    setLines([
      ...lines,
      {
        itemId: existing?._id,
        product: nextProduct,
        quantity: units,
        unitCostCents: unitCost,
        photos,
      },
    ]);
    resetProductFields();
    Keyboard.dismiss();
    setMessage(`${nextProduct.name} ajouté. Ajoutez un autre produit ou vérifiez la réception.`);
    supplierScroll.current?.scrollTo({ y: 0, animated: !reduceMotion });
  }
  async function saveSupplierReceipt() {
    const scope=await captureAccountScope();
    if(saved)throw new Error('Réception déjà enregistrée. Ouvrez « Opérations à vérifier » pour envoyer les pièces jointes initiales.');
    validateSupplier();
    if (!lines.length) throw new Error('Ajoutez au moins un produit avant de valider.');
    let result = saved;
    if (!result) {
      const response = await operation('/supplier-receipts', {
        supplier,
        reference,
        occurredAt: timestamp(date),
        lines: lines.map(({ photos, ...l }) => l),
      },{files:[...(invoice?[{target:'supplierReceiptId' as const,file:invoice,operationId:Crypto.randomUUID()}]:[]),...lines.flatMap((line,index)=>line.photos.map(file=>({target:'itemId' as const,index,file,operationId:Crypto.randomUUID()})))]});
      result = response.result;
      scope.assertActive();
      setSaved(result);
    }
    await uploadCurrentFinancialFiles('/supplier-receipts',scope);
    scope.assertActive();
    setMessage('Stock et pièces jointes enregistrés.');
    setLines([]);
    setSaved(null);
    setInvoice(null);
    setUploaded([]);
    setStep(0);
    attempts.current.clear();
    setReference('');
    setSupplier('');
    setDate(today());
    resetProductFields();
    await finishFinancialAttempt('/supplier-receipts',scope);
    await onChanged().catch(()=>{scope.assertActive();setMessage('Réception enregistrée. Actualisez le stock pour charger les dernières données.');});
    scope.assertActive();
    Keyboard.dismiss();
    supplierScroll.current?.scrollTo({ y: 0, animated: !reduceMotion });
  }
  const activeItem = details?.item ?? item;
  return (
    <>
      {!item ? (
        <View>
          <InventoryButton
            label="Ajouter un achat fournisseur"
            onPress={() => setMode('supplier')}
          />
          <InventoryButton
            secondary
            label="Achats fournisseurs et factures"
            onPress={() => {
              setMode('receipts');
              void run(async () => {
                const p = await request<Page<(typeof receipts)[number]>>('/supplier-receipts');
                setReceipts(p.page);
                setCursor(p.isDone ? null : p.continueCursor);
              });
            }}
          />
          <InventoryButton
            secondary
            label="Dons et export comptable"
            onPress={() => {
              setMode('gifts');
              void run(() => loadGifts());
            }}
          />
        </View>
      ) : (
        <Panel>
          <InventoryButton label="Modifier la fiche" onPress={() => setEditingProduct(true)} />
          {editingProduct && (
            <ProductEditor
              itemId={item._id}
              onClose={() => setEditingProduct(false)}
              onChanged={async () => {
                await loadDetails();
                await onChanged();
              }}
            />
          )}
          <InventoryButton secondary label="Photos du produit" onPress={() => setMode('photos')} />
          {item.origin !== 'consignment' && (
            <InventoryButton
              secondary
              label="Donner / Offrir"
              onPress={() => {
                setSavedGift(null);
                setQuantity('1');
                attempts.current.clear();
                setMode('gift');
              }}
            />
          )}
          {item.origin === 'supplier' && item.format === 'display' && (
            <InventoryButton
              label="Ouvrir un display"
              onPress={() => {
                attempts.current.clear();
                setQuantity('1');
                setName('Booster · ' + item.name);
                setTcg(item.tcg ?? 'pokemon');
                setKind('sealed');
                setFormat('booster');
                setRate(String((item.taxRateBps ?? 0) / 100));
                setExisting(null);
                setMode('opening');
              }}
            />
          )}
          {item.origin === 'supplier' && (
            <>
              <Copy>{activeItem?.quantity ?? 0} exemplaire(s) disponibles</Copy>
            </>
          )}
        </Panel>
      )}
      <Modal
        visible={!!mode}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={goBack}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            {mode === 'supplier' ? (
              <View
                style={{
                  paddingHorizontal: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  minHeight: 52,
                }}
              >
                <Pressable accessibilityRole="button" accessibilityLabel={step>0&&!saved?'Retour à l’étape précédente':'Retour au stock'} disabled={busy} onPress={goBack} style={{minHeight:44,justifyContent:'center',paddingRight:12}}><Text style={{color:colors.accent,fontSize:17}}>‹ Retour</Text></Pressable>
                <Text style={{color:colors.text,fontWeight:'600',fontSize:17,flex:1}}>Entrée en stock</Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={close}
                  style={{
                    minHeight: 44,
                    minWidth: 60,
                    justifyContent: 'center',
                    alignItems: 'flex-end',
                  }}
                >
                  <Text style={{ color: colors.accent, fontSize: 17 }}>Fermer</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ paddingHorizontal: 16 }}>
                <InventoryButton secondary label="‹ Retour" disabled={busy} onPress={close} />
              </View>
            )}
            <ScrollView
              ref={supplierScroll}
              keyboardDismissMode="interactive"
              pointerEvents={busy ? 'none' : 'auto'}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            >
              <Text
                accessibilityRole="header"
                style={{ fontSize: 30, fontWeight: '700', color: colors.text, marginBottom: 16 }}
              >
                {
                  (
                    {
                      supplier: ['Votre facture', 'Les produits reçus', 'Vérifier la réception'][
                        step
                      ],
                      gift: 'Donner / Offrir',
                      opening: 'Ouvrir un display',
                      photos: 'Photos et justificatifs',
                      gifts: 'Dons et cadeaux',
                      receipts: 'Achats fournisseurs',
                    } as Record<string, string>
                  )[mode ?? '']
                }
              </Text>
              {!!error && (
                <Text accessibilityRole="alert" style={{ color: colors.danger, marginBottom: 12 }}>
                  {error}
                </Text>
              )}
              {!!message && (
                <Text
                  accessibilityLiveRegion="polite"
                  style={{ color: colors.success, marginBottom: 12 }}
                >
                  {message}
                </Text>
              )}
              {mode === 'supplier' && (
                <>
                  <SupplierProgress step={step} />
                  {saved ? (
                    <Panel>
                      <Copy>
                        Réception enregistrée. Les produits sont disponibles en stock. Vous pouvez
                        réessayer les pièces jointes sans recréer l’achat.
                      </Copy>
                    </Panel>
                  ) : step === 0 ? (
                    <>
                      <Panel>
                        <SectionHeading
                          title="Origine de l’achat"
                          detail="Associez les produits à leur facture fournisseur."
                        />
                        <Field
                          label="Fournisseur"
                          placeholder="Nom du fournisseur"
                          maxLength={200}
                          value={supplier}
                          onChangeText={setSupplier}
                        />
                        <Field
                          label="Référence de facture"
                          maxLength={200}
                          placeholder="Ex. FAC-2026-042"
                          value={reference}
                          onChangeText={setReference}
                        />
                        <DateField label="Date" value={date} onChange={setDate} />
                      </Panel>
                      <Panel>
                        <SectionHeading
                          title="Justificatif"
                          detail="Facultatif · une photo ou un PDF à conserver avec l’achat."
                        />
                        <AttachmentPreview allowPdf current={invoice} onUse={setInvoice} />
                      </Panel>
                    </>
                  ) : step === 1 ? (
                    <>
                      <InventoryButton
                        secondary
                        label="Réapprovisionner un produit existant"
                        onPress={() => setPicker(true)}
                      />
                      {picker && <ProductPicker onPick={pick} onClose={() => setPicker(false)} />}
                      <Panel>
                        <SectionHeading
                          title={existing ? 'Produit existant' : 'Nouvelle fiche produit'}
                          detail={
                            existing
                              ? 'Les unités sont ajoutées à la même fiche.'
                              : 'Un même produit peut avoir plusieurs exemplaires.'
                          }
                        />
                        {existing ? (
                          <>
                            <Copy>
                              Réapprovisionnement : {existing.name}. Le prix public et la visibilité
                              sont conservés.
                            </Copy>
                            <InventoryButton
                              secondary
                              label="Créer plutôt une nouvelle fiche"
                              onPress={() => setExisting(null)}
                            />
                          </>
                        ) : (
                          <>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                              {(['sealed', 'card', 'other'] as const).map((k) => (
                                <InventoryButton
                                  key={k}
                                  secondary={kind !== k}
                                  label={
                                    k === 'sealed'
                                      ? 'Scellé'
                                      : k === 'card'
                                        ? 'Carte à l’unité'
                                        : 'Autre objet'
                                  }
                                  onPress={() => setKind(k)}
                                />
                              ))}
                            </View>
                            <Copy>Univers / jeu</Copy>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                              {(['pokemon', 'riftbound', 'other'] as const).map((game) => (
                                <InventoryButton
                                  key={game}
                                  label={
                                    game === 'pokemon'
                                      ? 'Pokémon'
                                      : game === 'riftbound'
                                        ? 'Riftbound'
                                        : 'Autre'
                                  }
                                  secondary={tcg !== game}
                                  disabled={busy}
                                  onPress={() => setTcg(game)}
                                />
                              ))}
                            </View>
                            <Field label="Nom du produit" value={name} onChangeText={setName} />
                            <Field label="Série" value={series} onChangeText={setSeries} />
                            <Copy>Langue</Copy>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                              {(['fr', 'en', 'ja', 'zh'] as const).map((l) => (
                                <InventoryButton
                                  key={l}
                                  secondary={language !== l}
                                  label={l === 'zh' ? 'Chinois' : l.toUpperCase()}
                                  onPress={() => setLanguage(l)}
                                />
                              ))}
                            </View>

                            {kind === 'sealed' && (
                              <>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                  {(['display', 'booster', 'box', 'other'] as const).map((f) => (
                                    <InventoryButton
                                      key={f}
                                      secondary={format !== f}
                                      label={
                                        {
                                          display: 'Display',
                                          booster: 'Booster',
                                          box: 'Coffret',
                                          other: 'Autre',
                                        }[f]
                                      }
                                      onPress={() => setFormat(f)}
                                    />
                                  ))}
                                </View>
                                {format === 'display' && (
                                  <Field
                                    label="Boosters par display"
                                    value={pack}
                                    onChangeText={setPack}
                                    keyboardType="decimal-pad"
                                  />
                                )}
                              </>
                            )}
                            {kind === 'card' && (
                              <>
                                <Field
                                  label="Numéro de carte"
                                  value={identifier}
                                  onChangeText={setIdentifier}
                                />
                                <Copy>État</Copy>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                  {(['M', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO'] as const).map((c) => (
                                    <InventoryButton
                                      key={c}
                                      secondary={condition !== c}
                                      label={c}
                                      onPress={() => setCondition(c)}
                                    />
                                  ))}
                                </View>
                                <GradingCompanyPicker value={gradingCompany} onChange={value => setGradingCompany(value || undefined)} />
                                {gradingCompany && (
                                  <>
                                    <Field label="Note" value={grade} onChangeText={setGrade} />
                                    <Field
                                      label="Certificat"
                                      value={certificate}
                                      onChangeText={setCertificate}
                                    />
                                  </>
                                )}
                              </>
                            )}
                          </>
                        )}
                      </Panel>
                      <Panel>
                        <SectionHeading
                          title="Quantité et prix"
                          detail="Saisissez le coût d’achat, puis choisissez votre prix de vente."
                        />
                        <Field
                          label="Quantité reçue"
                          value={quantity}
                          onChangeText={setQuantity}
                          keyboardType="decimal-pad"
                        />
                        <Field
                          label={`Coût unitaire HT (${shopCurrency()})`}
                          value={cost}
                          onChangeText={setCost}
                          keyboardType="decimal-pad"
                        />
                        {!existing && (
                          <>
                            <Field
                              label={`Prix de vente unitaire TTC (${shopCurrency()})`}
                              value={price}
                              onChangeText={setPrice}
                              keyboardType="decimal-pad"
                            />
                            <Field
                              label="Taux de TVA de vente (%)"
                              value={rate}
                              onChangeText={setRate}
                              keyboardType="decimal-pad"
                            />
                          </>
                        )}
                        <ProductProfitPreview
                          cost={cost}
                          price={existing ? String((existing.askingPriceCents ?? 0) / 100) : price}
                          rate={existing ? String((existing.taxRateBps ?? 0) / 100) : rate}
                          quantity={quantity}
                          onPriceChange={existing ? undefined : setPrice}
                        />
                      </Panel>
                      <Panel>
                        <SectionHeading
                          title="Photos du produit"
                          detail="Facultatif · sélectionnez plusieurs photos en une fois."
                        />
                        <MultiPhotoPicker
                          photos={photos}
                          onChange={setPhotos}
                          disabled={busy}
                          limit={supplierPhotoCapacity}
                        />
                        <InventoryButton
                          label="Ajouter à la réception"
                          disabled={busy}
                          onPress={() => void run(async () => addSupplierLine())}
                        />
                        {productInProgress && (
                          <InventoryButton
                            secondary
                            disabled={busy}
                            label="Effacer le produit en cours"
                            onPress={() =>
                              Alert.alert(
                                'Effacer ce produit ?',
                                'Les produits déjà ajoutés à la réception seront conservés.',
                                [
                                  { text: 'Annuler', style: 'cancel' },
                                  {
                                    text: 'Effacer',
                                    style: 'destructive',
                                    onPress: () => {
                                      resetProductFields();
                                      setError('');
                                      setMessage('');
                                      Keyboard.dismiss();
                                      supplierScroll.current?.scrollTo({ y: 0, animated: !reduceMotion });
                                    },
                                  },
                                ],
                              )
                            }
                          />
                        )}
                      </Panel>
                    </>
                  ) : null}
                  {step === 2 && (
                    <Panel>
                      <Copy>
                        {supplier} · {reference}
                      </Copy>
                      <Copy>Date : {date}</Copy>
                      <Text style={{ color: colors.secondary }}>
                        Justificatif : {invoice?.name ?? 'Non ajouté'}
                      </Text>
                    </Panel>
                  )}
                  {lines.length > 0 && step > 0 && (
                    <Panel>
                      <SectionHeading
                        title={step === 2 ? 'Produits à enregistrer' : 'Dans cette réception'}
                        detail={`${lines.length} produit(s) · ${supplierUnits} unité(s)`}
                      />
                      {lines.map((l, i) => (
                        <View
                          key={i}
                          style={{
                            paddingVertical: 12,
                            borderBottomWidth: i < lines.length - 1 ? 1 : 0,
                            borderBottomColor: colors.border,
                            gap: 5,
                          }}
                        >
                          <Text style={{ color: colors.text, fontWeight: '600', fontSize: 17 }}>
                            {l.product.name} ·{' '}
                            {l.product.tcg === 'other'
                              ? 'Autre'
                              : l.product.tcg === 'riftbound'
                                ? 'Riftbound'
                                : 'Pokémon'}
                          </Text>
                          <Copy>
                            {l.quantity} × {money(l.unitCostCents)} HT ·{' '}
                            {money(l.quantity * l.unitCostCents)} HT
                          </Copy>
                          <Text style={{ color: colors.secondary, fontSize: 14 }}>
                            Vente {money(l.product.askingPriceCents)} TTC / unité ·{' '}
                            {l.photos.length} photo(s)
                          </Text>
                          <Text style={{ color: colors.secondary, fontSize: 14 }}>
                            {l.itemId
                              ? 'Réapprovisionnement · visibilité conservée'
                              : 'Nouvelle fiche · masquée du catalogue'}
                          </Text>
                          {!saved && (
                            <InventoryButton
                              secondary
                              label="Retirer la ligne"
                              onPress={() => setLines(lines.filter((_, j) => j !== i))}
                            />
                          )}
                        </View>
                      ))}
                      <Copy>
                        Total HT :{' '}
                        {money(lines.reduce((s, l) => s + l.quantity * l.unitCostCents, 0))}
                      </Copy>
                      <Copy>
                        Les nouvelles fiches sont masquées du catalogue jusqu’à votre choix.
                      </Copy>
                    </Panel>
                  )}
                </>
              )}
              {mode === 'photos' && item && (
                <>
                  <Panel>
                    <ItemThumbnail
                      item={{ ...item, photos: details?.photos ?? item.photos }}
                      style={{ width: '100%', height: 180 }}
                    />
                    <MultiPhotoPicker
                      photos={newPhotos}
                      onChange={setNewPhotos}
                      disabled={busy}
                      limit={Math.max(
                        0,
                        6 -
                          (details?.photos.filter((p) => p.contentType.startsWith('image/'))
                            .length ??
                            item.photos?.length ??
                            0),
                      )}
                    />
                    <InventoryButton
                      disabled={busy || !newPhotos.length}
                      label="Enregistrer les photos"
                      onPress={() =>
                        void run(async () => {
                          try {
                            for (const photo of newPhotos) {
                              await upload('itemId', item._id, photo);
                              setNewPhotos((remaining) =>
                                remaining.filter((p) => p.uri !== photo.uri),
                              );
                            }
                          } finally {
                            await loadDetails();
                            await onChanged();
                          }
                          setMessage('Photos enregistrées.');
                        })
                      }
                    />
                    {details?.photos
                      .filter((p) => p.contentType.startsWith('image/'))
                      .map((p) => (
                        <View key={p._id}>
                          <Copy>
                            {p.filename}
                            {activeItem?.coverPhotoId === p._id ? ' · Couverture' : ''}
                          </Copy>
                          <InventoryButton
                            secondary
                            disabled={busy}
                            label="Utiliser en couverture"
                            onPress={() =>
                              void run(async () => {
                                await request('/stock/photo', {
                                  itemId: item._id,
                                  attachmentId: p._id,
                                  action: 'cover',
                                });
                                await loadDetails();
                                await onChanged();
                              })
                            }
                          />
                          <InventoryButton
                            secondary
                            disabled={busy}
                            label="Supprimer la photo"
                            onPress={() =>
                              Alert.alert(
                                'Supprimer la photo ?',
                                'Elle sera retirée de la fiche produit.',
                                [
                                  { text: 'Annuler', style: 'cancel' },
                                  {
                                    text: 'Supprimer',
                                    style: 'destructive',
                                    onPress: () =>
                                      void run(async () => {
                                        await request('/stock/photo', {
                                          itemId: item._id,
                                          attachmentId: p._id,
                                          action: 'remove',
                                        });
                                        await loadDetails();
                                        await onChanged();
                                      }),
                                  },
                                ],
                              )
                            }
                          />
                        </View>
                      ))}
                  </Panel>
                </>
              )}
              {mode === 'gift' && item && (
                <Panel>
                  <Copy>
                    {item.name} · {activeItem?.quantity ?? 1} disponible(s)
                  </Copy>
                  <DateField label="Date" value={date} onChange={setDate} />
                  <Field
                    label="Quantité offerte"
                    value={quantity}
                    onChangeText={setQuantity}
                    keyboardType="decimal-pad"
                  />
                  <Field
                    label="Bénéficiaire (facultatif)"
                    value={recipient}
                    onChangeText={setRecipient}
                  />
                  <Field label="Motif" value={reason} onChangeText={setReason} />
                  <Field label="Note" value={note} onChangeText={setNote} multiline />
                  <AttachmentPreview current={giftAttachment} onUse={setGiftAttachment} allowPdf />
                  <Copy>Cette sortie de stock ne crée ni vente ni encaissement.</Copy>
                  <InventoryButton
                    disabled={busy}
                    label={savedGift ? 'Réessayer le justificatif' : 'Confirmer le don'}
                    onPress={() =>
                      void run(async () => {
                        const scope=await captureAccountScope();
                        let id = savedGift;
                        if(id)throw new Error('Don déjà enregistré. Ouvrez « Opérations à vérifier » pour envoyer le justificatif initial.');
                        if (!id) {
                          id = (
                            await operation('/stock/donate', {
                              itemId: item._id,
                              quantity: count(quantity),
                              occurredAt: timestamp(date),
                              recipient,
                              reason,
                              note,
                            },{files:giftAttachment?[{target:'giftId',file:giftAttachment,operationId:Crypto.randomUUID()}]:[]})
                          ).result;
                          scope.assertActive();
                          setSavedGift(id);
                        }
                        await uploadCurrentFinancialFiles('/stock/donate',scope);
                        scope.assertActive();
                        setMessage('Don enregistré et disponible dans l’export comptable.');
                        setGiftAttachment(null);
                        setMode(null);
                        await finishFinancialAttempt('/stock/donate',scope);
                        await onChanged().catch(()=>{scope.assertActive();setMessage('Don enregistré. Actualisez le stock.');});
                        scope.assertActive();await loadDetails().catch(()=>{scope.assertActive();setMessage('Don enregistré. Actualisation des lots indisponible.');});
                      })
                    }
                  />
                </Panel>
              )}
              {mode === 'opening' && item && (
                <>
                  <Panel>
                    <Copy>
                      {item.name} · {activeItem?.quantity ?? 0} display(s) disponibles
                    </Copy>
                    <Field
                      label="Displays à ouvrir"
                      value={quantity}
                      onChangeText={setQuantity}
                      keyboardType="decimal-pad"
                    />
                    <Field
                      label="Boosters par display"
                      value={pack}
                      onChangeText={setPack}
                      keyboardType="decimal-pad"
                    />
                    <DateField label="Date" value={date} onChange={setDate} />
                    <InventoryButton
                      secondary
                      label="Ajouter à un produit booster existant"
                      onPress={() => setPicker(true)}
                    />
                    {picker && <ProductPicker onPick={pick} onClose={() => setPicker(false)} />}
                    {existing ? (
                      <>
                        <Copy>Destination : {existing.name}</Copy>
                        <InventoryButton
                          secondary
                          label="Créer un nouveau produit booster"
                          onPress={() => {
                            setExisting(null);
                            setKind('sealed');
                            setFormat('booster');
                            setRate(String((item.taxRateBps ?? 0) / 100));
                          }}
                        />
                      </>
                    ) : (
                      <>
                        <Field label="Nom du booster" value={name} onChangeText={setName} />
                        <Field
                          label={`Prix de vente unitaire TTC (${shopCurrency()})`}
                          value={price}
                          onChangeText={setPrice}
                          keyboardType="decimal-pad"
                        />
                      </>
                    )}
                    <Copy>
                      {Number(quantity) || 0} display(s) →{' '}
                      {(Number(quantity) || 0) * (Number(pack) || 0)} boosters. Le coût et la
                      facture sont conservés.
                    </Copy>
                    <InventoryButton
                      disabled={busy}
                      label="Confirmer l’ouverture"
                      onPress={() =>
                        void run(async () => {
                          const scope=await captureAccountScope();
                          await operation('/stock/open', {
                            itemId: item._id,
                            ...(existing
                              ? { targetId: existing._id }
                              : {
                                  product: {
                                    ...product(),
                                    productType: 'sealed',
                                    format: 'booster',
                                    taxRateBps: item.taxRateBps ?? 0,
                                    tcg: item.tcg ?? 'pokemon',
                                  },
                                }),
                            quantity: count(quantity),
                            packSize: count(pack),
                            occurredAt: timestamp(date),
                          });
                          scope.assertActive();
                          setMode(null);
                          await finishFinancialAttempt('/stock/open',scope);
                          setMessage(
                            'Ouverture enregistrée. Les boosters sont disponibles dans le panier habituel.',
                          );
                          await loadDetails().catch(()=>{scope.assertActive();setMessage('Ouverture enregistrée. Actualisation des lots indisponible.');});
                          scope.assertActive();
                          await onChanged().catch(()=>{scope.assertActive();setMessage('Ouverture enregistrée. Actualisez le stock.');});
                        })
                      }
                    />
                  </Panel>
                  {details?.openings.map((o) => (
                    <Panel key={o._id}>
                      <Copy>
                        {o.quantity} display(s) → {o.quantity * o.packSize} boosters ·{' '}
                        {o.cancelledAt ? 'Annulée' : 'Enregistrée'}
                      </Copy>
                      {!o.cancelledAt && o.reversalAvailable === false && <Copy>Annulation indisponible : l’historique des allocations doit être réconcilié avant de restaurer le stock.</Copy>}
                      {!o.cancelledAt && (
                        <InventoryButton
                          secondary
                          disabled={busy || o.reversalAvailable === false}
                          label="Annuler si tous les boosters sont disponibles"
                          onPress={() =>
                            void run(async () => {
                              await operation('/stock/reverse', { openingId: o._id });
                              await loadDetails();
                              await onChanged();
                            })
                          }
                        />
                      )}
                    </Panel>
                  ))}
                </>
              )}
              {mode === 'gifts' && (
                <>
                  <Panel>
                    <DateField label="Du" value={from} onChange={setFrom} />
                    <DateField label="Au" value={to} onChange={setTo} />
                    <InventoryButton
                      disabled={busy}
                      label="Appliquer la période"
                      onPress={() => void run(() => loadGifts())}
                    />
                    <InventoryButton
                      disabled={busy}
                      secondary
                      label="Exporter pour le comptable (CSV)"
                      onPress={() => void run(exportGifts)}
                    />
                  </Panel>
                  {gifts.map((g) => (
                    <Panel key={g._id}>
                      <InventoryButton
                        secondary
                        disabled={busy}
                        label="Voir les justificatifs"
                        onPress={() => void run(() => showEvidence('giftId', g._id))}
                      />
                      <Copy>
                        {g.quantity} × {g.itemName}
                      </Copy>
                      <Copy>
                        {formatShopDate(g.occurredAt)} · {g.reason} ·{' '}
                        {g.recipient ?? 'Bénéficiaire non renseigné'}
                      </Copy>
                      <Copy>
                        Coût connu :{' '}
                        {money(g.costCents)} ·{' '}
                        {g.cancelledAt ? 'Annulé' : 'Actif'}
                      </Copy>
                      {!g.cancelledAt && g.reversalAvailable === false && <Copy>Annulation indisponible : l’historique des allocations doit être réconcilié avant de restaurer le stock.</Copy>}
                      {!g.cancelledAt && (
                        <InventoryButton
                          secondary
                          disabled={busy || g.reversalAvailable === false}
                          label="Annuler et remettre en stock"
                          onPress={() =>
                            void run(async () => {
                              await operation('/stock/reverse', { giftId: g._id });
                              await loadGifts();
                              await onChanged();
                            })
                          }
                        />
                      )}
                    </Panel>
                  ))}
                  {cursor && (
                    <InventoryButton
                      disabled={busy}
                      secondary
                      label="Afficher les dons suivants"
                      onPress={() => void run(() => loadGifts(cursor))}
                    />
                  )}
                </>
              )}
              {mode === 'receipts' && (
                <>
                  {receipts.map((r) => (
                    <Panel key={r._id}>
                      <InventoryButton
                        secondary
                        disabled={busy}
                        label="Voir les factures"
                        onPress={() => void run(() => showEvidence('receiptId', r._id))}
                      />
                      <Copy>
                        {r.supplier} · {r.reference}
                      </Copy>
                      <Copy>{money(r.totalCostCents)} HT</Copy>
                      <AttachmentPreview current={invoice} onUse={setInvoice} allowPdf />
                      <InventoryButton
                        disabled={busy || !invoice}
                        secondary
                        label="Joindre une facture"
                        onPress={() =>
                          void run(async () => {
                            await upload('supplierReceiptId', r._id, invoice!);
                            setInvoice(null);
                            setMessage('Facture ajoutée.');
                          })
                        }
                      />
                    </Panel>
                  ))}
                  {cursor && (
                    <InventoryButton
                      disabled={busy}
                      secondary
                      label="Réceptions suivantes"
                      onPress={() =>
                        void run(async () => {
                          const p = await request<Page<(typeof receipts)[number]>>(
                            '/supplier-receipts?cursor=' + encodeURIComponent(cursor),
                          );
                          setReceipts([...receipts, ...p.page]);
                          setCursor(p.isDone ? null : p.continueCursor);
                        })
                      }
                    />
                  )}
                </>
              )}
              {evidence.length > 0 && (
                <Panel>
                  <Copy>Pièces jointes du dossier sélectionné</Copy>
                  {evidence.map((a) => (
                    <InventoryButton
                      key={a._id}
                      secondary
                      disabled={busy}
                      label={a.filename}
                      onPress={() =>
                        void run(() => openAttachment(a._id, a.filename, a.contentType))
                      }
                    />
                  ))}
                </Panel>
              )}
            </ScrollView>
            {mode === 'supplier' && (
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingTop: 12,
                  paddingBottom: 8,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                  backgroundColor: colors.surface,
                }}
              >
                {step > 0 && (
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      gap: 12,
                      marginBottom: 6,
                    }}
                  >
                    <Text style={{ color: colors.secondary, flex: 1 }}>
                      {supplierUnits} unité(s) · {lines.length} produit(s)
                    </Text>
                    <Text
                      style={{
                        color: colors.text,
                        fontWeight: '700',
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {money(supplierTotal)} HT
                    </Text>
                  </View>
                )}
                <InventoryButton
                  disabled={busy || (!saved && step > 0 && !lines.length)}
                  label={
                    busy
                      ? 'Enregistrement…'
                      : saved
                        ? 'Terminer l’envoi des pièces'
                        : step === 0
                          ? 'Continuer vers les produits'
                          : step === 1
                            ? 'Vérifier la réception'
                            : 'Confirmer l’entrée en stock'
                  }
                  onPress={() =>
                    void run(async () => {
                      if (!saved && step < 2) supplierStep(step + 1);
                      else await saveSupplierReceipt();
                    })
                  }
                />
              </View>
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
