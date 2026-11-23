import {DetailContext, NativeDetailScene, createDetailStore} from './NativeDetail';
import { createContext, useContext, useEffect, useRef, useMemo, type ReactNode } from 'react';
import { DarkTheme, DefaultTheme, NavigationContainer, StackActions, useNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { activeTab, pageHeaders, type Page } from './MobileNavigation';

export type RootTab = 'stock' | 'history' | 'sales' | 'activity' | 'account';
const roots: RootTab[] = ['history', 'sales', 'stock', 'activity', 'account'];
const flows: Page[] = ['purchaseDetail', 'saleDetail', 'clients', 'consignments', 'saleSummary', 'salePayment', 'saleComplete', 'salesHistory'];
type Routes = Record<string, { screen?: RootTab; detailId?: string; title?: string } | undefined>;
const Tab = createBottomTabNavigator<Record<RootTab, undefined>>();
const Stack = createNativeStackNavigator<Routes>();
const Scenes = createContext<{render: (page: Page, active: boolean, step?: number) => ReactNode; page: Page; step: number}>({render: () => null, page: 'history', step: 0});
function TabScene({route}: {route: {name: RootTab}}) {
  const scene = useContext(Scenes);
  return <>{scene.render(route.name, scene.page === route.name)}</>;
}
function Workspace() {
  return <Tab.Navigator initialRouteName="history" tabBar={() => null} screenOptions={{headerShown: false}}>
    {roots.map(name => <Tab.Screen key={name} name={name} component={TabScene} />)}
  </Tab.Navigator>;
}
function FlowScene({route}: {route: {name: string}}) {
  const scene = useContext(Scenes);
  const purchase = route.name.startsWith('purchase:');
  const page = purchase ? 'purchase' : route.name as Page;
  const step = purchase ? Number(route.name.split(':')[1]) : undefined;
  return <>{scene.render(page, scene.page === page && (!purchase || step === scene.step), step)}</>;
}

/** Native stack owns Back/interactive gestures; business drafts remain in App state. */
export function NativeTabs({page, purchaseStep, renderScene, onChange}: {
  page: Page; purchaseStep: number;
  renderScene: (page: Page, active: boolean, step?: number) => ReactNode;
  onChange: (page: Page, step?: number) => void;
}) {
  const navigation = useNavigationContainerRef<Routes>();
  const {colors, dark,reduceMotion} = useTheme();
  const detailStore = useMemo(createDetailStore, []);
  const activeDetails = useRef(new Set<string>());
  const ready = useRef(false);
  const pendingTarget = useRef<string | null>(null);
  const lastTarget = useRef('');
  const callback = useRef(onChange); callback.current = onChange;
  const target = page === 'purchase' ? `purchase:${purchaseStep}` : roots.includes(page as RootTab) ? 'Workspace' : page;
  const sync = () => {
    if (!ready.current) return;
    const key = `${target}:${page}`;
    if (lastTarget.current === key) return;
    lastTarget.current = key;
    pendingTarget.current = target === 'Workspace' ? page : target;
    const state = navigation.getRootState();
    if (!state) return;
    if (target === 'Workspace') {
      if (state.index > 0) navigation.dispatch(StackActions.popToTop());
      navigation.navigate('Workspace', {screen: page as RootTab});
    } else if (state.routes[state.index].name !== target) {
      if (state.routes.some(route => route.name === target)) navigation.dispatch(StackActions.popTo(target));
      else if (page === 'purchase' && state.routes[state.index].name.startsWith('purchase:')) navigation.dispatch(StackActions.push(target));
      else if (page === 'purchase') {
        const existing = state.routes.filter(route => !route.name.startsWith('purchase:'));
        navigation.resetRoot({...state, index: existing.length + purchaseStep, routes: [...existing, ...Array.from({length: purchaseStep + 1}, (_, step) => ({name: `purchase:${step}`, key: `purchase:${step}:${Date.now()}`}))]});
      } else navigation.dispatch(StackActions.push(target));
    }
  };
  useEffect(sync, [page, purchaseStep]);
  const base = dark ? DarkTheme : DefaultTheme;
  const details = useMemo(() => ({store: detailStore,
    open: (id: string, title: string) => {activeDetails.current.add(id); if (navigation.isReady()) navigation.dispatch(StackActions.push('dossier', {detailId: id, title}));},
    dismiss: (id: string) => {if (!activeDetails.current.delete(id) || !navigation.isReady()) return; const route = navigation.getCurrentRoute(); if (route?.name === 'dossier' && (route.params as {detailId?: string})?.detailId === id) navigation.goBack();},
  }), [detailStore, navigation]);
  return <DetailContext.Provider value={details}><Scenes.Provider value={{render: renderScene, page, step: purchaseStep}}>
    <NavigationContainer ref={navigation} theme={{...base, colors: {...base.colors, primary: colors.accent, background: colors.background, card: colors.surface, text: colors.text, border: colors.border}}}
      onReady={() => {ready.current = true; sync(); for (const id of activeDetails.current) {const entry = detailStore.get(id); if(entry) navigation.dispatch(StackActions.push('dossier', {detailId:id,title:entry.title}));}}}
      onStateChange={() => {
        const route = navigation.getCurrentRoute();
        if (!route) return;
        const ids = new Set(navigation.getRootState()?.routes.filter(route => route.name === 'dossier').map(route => (route.params as {detailId?: string})?.detailId));
        for (const id of activeDetails.current) if (!ids.has(id)) {activeDetails.current.delete(id); detailStore.get(id)?.onClose();}
        if (route.name === 'dossier') return;
        if (pendingTarget.current && route.name !== pendingTarget.current) return;
        pendingTarget.current = null;
        const purchase = route.name.startsWith('purchase:');
        const next = purchase ? 'purchase' : route.name as Page;
        if (roots.includes(next as RootTab) || flows.includes(next) || purchase) {
          const step = purchase ? Number(route.name.split(':')[1]) : undefined;
          lastTarget.current = `${purchase ? route.name : roots.includes(next as RootTab) ? 'Workspace' : next}:${next}`;
          callback.current(next, step);
        }
      }}>
      <Stack.Navigator initialRouteName="Workspace" screenOptions={{animation:reduceMotion?'none':'default',headerBackTitle: 'Retour', headerTintColor: colors.accent, headerStyle: {backgroundColor: colors.surface}, contentStyle: {backgroundColor: colors.background}}}>
        <Stack.Screen name="dossier" component={NativeDetailScene} options={({route}) => ({title: route.params?.title ?? "Dossier"})} />
        <Stack.Screen name="Workspace" component={Workspace} options={{headerShown: false}} />
        {[0,1,2].map(step => <Stack.Screen key={step} name={`purchase:${step}`} component={FlowScene} options={{title: ['Contact', 'Cartes à reprendre', 'Vérifier le rachat'][step]}} />)}
        {flows.map(name => <Stack.Screen key={name} name={name} component={FlowScene} options={{title: pageHeaders[name][0]}} />)}
      </Stack.Navigator>
    </NavigationContainer>
  </Scenes.Provider></DetailContext.Provider>;
}
