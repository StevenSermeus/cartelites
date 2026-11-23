import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';

/** A swipe only exposes the action; deletion always requires an explicit tap. */
export function SwipeToDelete({ children, onDelete, label, enabled = true, disabled = false }: {
  children: ReactNode;
  onDelete: () => void;
  label: string;
  enabled?: boolean;
  disabled?: boolean;
}) {
  const { colors,reduceMotion } = useTheme();
  const x = useRef(new Animated.Value(0)).current;
  const opened = useRef(false);
  const origin = useRef(0);
  const [open, setOpen] = useState(false);
  const settle = (next: boolean) => {
    opened.current = next;
    setOpen(next);
    x.stopAnimation();
    if(reduceMotion)x.setValue(next?-76:0);
    else Animated.spring(x, { toValue: next ? -76 : 0, useNativeDriver: true, bounciness: 0 }).start();
  };
  useEffect(()=>{if(reduceMotion){x.stopAnimation();x.setValue(opened.current?-76:0);}},[reduceMotion,x]);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => enabled && !disabled && opened.current,
    onMoveShouldSetPanResponder: (_, g) => enabled && !disabled &&
      Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5 && (g.dx < 0 || opened.current),
    onPanResponderGrant: () => { x.stopAnimation(); origin.current = opened.current ? -76 : 0; },
    onPanResponderMove: (_, g) => x.setValue(Math.max(-76, Math.min(0, origin.current + g.dx))),
    onPanResponderRelease: (_, g) => settle(Math.abs(g.dx) > 4 && origin.current + g.dx < -32),
    onPanResponderTerminate: () => settle(false),
    onPanResponderTerminationRequest: () => false,
  }), [enabled, disabled, x,reduceMotion]);
  if (!enabled) return <>{children}</>;
  return <View style={{ overflow: 'hidden', backgroundColor: colors.danger }}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'yes' : 'no-hide-descendants'}
      disabled={disabled || !open}
      onPress={() => { settle(false); onDelete(); }}
      style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 76, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name="trash-outline" size={24} color={colors.background} />
    </Pressable>
    <Animated.View {...pan.panHandlers} style={{ backgroundColor: colors.surface, transform: [{ translateX: x }] }}>
      {children}
    </Animated.View>
  </View>;
}
