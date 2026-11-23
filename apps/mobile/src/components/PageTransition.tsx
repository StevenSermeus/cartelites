import {useTheme} from '../theme/ThemeProvider';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

/** Animate content without remounting forms or moving navigation controls. */
export function PageTransition({
  transitionKey,
  children,
  style,
}: {
  transitionKey: string | number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const progress = useRef(new Animated.Value(1)).current;
  const previous = useRef(transitionKey);
  const {reduceMotion}=useTheme();
  useLayoutEffect(() => {
    const changed = previous.current !== transitionKey;
    previous.current = transitionKey;
    progress.stopAnimation();
    if (reduceMotion || !changed) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [transitionKey, reduceMotion, progress]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] }),
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
