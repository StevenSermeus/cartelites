import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, Easing, Keyboard, View, useWindowDimensions } from 'react-native';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  useNavigationContainerRef,
} from '@react-navigation/native';
import {
  createBottomTabNavigator,
  type BottomTabNavigationOptions,
} from '@react-navigation/bottom-tabs';
import { useTheme } from '../theme/ThemeProvider';

export type RootTab = 'stock' | 'history' | 'sales' | 'consignments' | 'account';
type Tabs = Record<RootTab, undefined>;
const Tab = createBottomTabNavigator<Tabs>();
const routes: RootTab[] = ['stock', 'history', 'sales', 'consignments', 'account'];
const SceneContent = createContext<(tab: RootTab) => ReactNode>(() => null);
function TabContent({ route }: { route: { name: RootTab } }) {
  return useContext(SceneContent)(route.name);
}

// Data updates go to scenes through context, without recreating navigation descriptors
// and restarting the navigator's in-flight transition.
const Navigator = memo(function Navigator({
  active,
  onChange,
}: {
  active: RootTab;
  onChange: (tab: RootTab) => void;
}) {
  const navigation = useNavigationContainerRef<Tabs>();
  const initial = useRef(active).current;
  const window = useWindowDimensions();
  const [width, setWidth] = useState(window.width);
  const { colors, dark } = useTheme();
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduceMotion(value);
      })
      .catch(() => undefined);
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      listener.remove();
    };
  }, []);
  useLayoutEffect(() => {
    if (navigation.isReady() && navigation.getCurrentRoute()?.name !== active) {
      Keyboard.dismiss();
      navigation.navigate(active);
    }
  }, [active, navigation]);
  const theme = useMemo(() => {
    const base = dark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        primary: colors.accent,
        border: colors.border,
      },
    };
  }, [colors, dark]);
  const options = useMemo<BottomTabNavigationOptions>(
    () => ({
      headerShown: false,
      animation: reduceMotion ? 'none' : 'shift',
      sceneStyle: { backgroundColor: colors.background },
      transitionSpec: {
        animation: 'timing',
        config: { duration: reduceMotion ? 0 : 280, easing: Easing.out(Easing.cubic) },
      },
      sceneStyleInterpolator: ({ current }) => ({
        sceneStyle: {
          transform: [
            {
              translateX: current.progress.interpolate({
                inputRange: [-1, 0, 1],
                outputRange: [-width, 0, width],
              }),
            },
          ],
        },
      }),
    }),
    [colors.background, reduceMotion, width],
  );
  return (
    <View
      style={{ flex: 1, backgroundColor: colors.background }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <NavigationContainer
        theme={theme}
        ref={navigation}
        onStateChange={() => {
          const selected = navigation.getCurrentRoute()?.name as RootTab | undefined;
          if (selected && selected !== active) onChange(selected);
        }}
        onReady={() => {
          if (navigation.getCurrentRoute()?.name !== active) navigation.navigate(active);
        }}
      >
        <Tab.Navigator initialRouteName={initial} tabBar={hiddenTabBar} screenOptions={options}>
          {routes.map((route) => (
            <Tab.Screen key={route} name={route} component={TabContent} />
          ))}
        </Tab.Navigator>
      </NavigationContainer>
    </View>
  );
});
function hiddenTabBar() {
  return null;
}

export function NativeTabs({
  active,
  renderScene,
  onChange,
}: {
  active: RootTab;
  renderScene: (tab: RootTab) => ReactNode;
  onChange: (tab: RootTab) => void;
}) {
  const callback = useRef(onChange);
  callback.current = onChange;
  const dispatch = useCallback((tab: RootTab) => callback.current(tab), []);
  return (
    <SceneContent.Provider value={renderScene}>
      <Navigator active={active} onChange={dispatch} />
    </SceneContent.Provider>
  );
}
