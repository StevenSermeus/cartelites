import { useRef, useState } from 'react';
import { Pressable, Text, View, type GestureResponderEvent } from 'react-native';
import type { Signature } from '../../../../packages/domain/src/signature';
export function SignaturePad({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: Signature;
  onChange: (value: Signature) => void;
  label: string;
  disabled?: boolean;
}) {
  const [width, setWidth] = useState(300);
  const drawing = useRef<Signature | null>(null);
  const point = (e: GestureResponderEvent) => [
    Math.max(0, Math.min(1, e.nativeEvent.locationX / width)),
    Math.max(0, Math.min(1, e.nativeEvent.locationY / (width / 3))),
  ];
  return (
    <View style={{ gap: 8 }}>
      <Text>{label}</Text>
      <View
        accessibilityLabel={label}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{
          width: '100%',
          aspectRatio: 3,
          backgroundColor: 'white',
          borderWidth: 1,
          borderColor: '#75695c',
          borderRadius: 8,
          overflow: 'hidden',
        }}
        onStartShouldSetResponder={() => !disabled && value.length < 80}
        onMoveShouldSetResponder={() => !disabled}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => {
          drawing.current = [...value, [point(e)]];
          onChange(drawing.current);
        }}
        onResponderMove={(e) => {
          const current = drawing.current;
          if (!current || disabled || current.flat().length >= 3000) return;
          const p = point(e),
            stroke = current[current.length - 1],
            previous = stroke[stroke.length - 1];
          if (Math.hypot(p[0] - previous[0], p[1] - previous[1]) < 0.003) return;
          drawing.current = [...current.slice(0, -1), [...stroke, p]];
          onChange(drawing.current);
        }}
        onResponderRelease={() => {
          if (drawing.current) onChange(drawing.current.filter((stroke) => stroke.length > 1));
          drawing.current = null;
        }}
        onResponderTerminate={() => {
          if (drawing.current) onChange(drawing.current.slice(0, -1));
          drawing.current = null;
        }}
      >
        <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
          {value.flatMap((stroke, s) =>
            stroke.slice(1).map((p, i) => {
              const a = stroke[i],
                dx = (p[0] - a[0]) * width,
                dy = ((p[1] - a[1]) * width) / 3;
              const length = Math.hypot(dx, dy);
              return (
                <View
                  key={`${s}-${i}`}
                  style={{
                    position: 'absolute',
                    left: ((a[0] + p[0]) * width) / 2 - length / 2,
                    top: ((a[1] + p[1]) * width) / 6 - 1,
                    width: length,
                    height: 2,
                    backgroundColor: '#14213d',
                    borderRadius: 1,
                    transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
                  }}
                />
              );
            }),
          )}
        </View>
      </View>
      <Pressable
        disabled={disabled}
        accessibilityRole="button"
        onPress={() => {
          drawing.current = null;
          onChange([]);
        }}
        style={{ padding: 12 }}
      >
        <Text>Effacer la signature</Text>
      </Pressable>
    </View>
  );
}
