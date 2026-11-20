import { useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { validSignature } from "../../../../packages/domain/src/signature";
import type { Signature } from "../../../../packages/domain/src/signature";
function SignatureCanvas({
  value,
  onChange,
  label,
  disabled = false,
  height,
}: {
  value: Signature;
  onChange: (value: Signature) => void;
  label: string;
  disabled?: boolean;
  height?: number;
}) {
  const [width, setWidth] = useState(300);
  const drawing = useRef<Signature | null>(null);
  const canvasHeight = height ?? width / 3;
  // Fit existing traces on rotation without stretching their PDF coordinates.
  // Keep the transform stable during each drawing session.
  const { virtualWidth, virtualHeight, offsetX, offsetY } = useMemo(() => {
    const points = value.flat();
    const minX = points.length ? Math.min(...points.map((p) => p[0])) : 0.5;
    const maxX = points.length ? Math.max(...points.map((p) => p[0])) : 0.5;
    const minY = points.length ? Math.min(...points.map((p) => p[1])) : 0.5;
    const maxY = points.length ? Math.max(...points.map((p) => p[1])) : 0.5;
    const h = Math.min(
      Math.max(width / 3, canvasHeight),
      (width - 16) / (3 * Math.max(maxX - minX, 0.01)),
      (canvasHeight - 16) / Math.max(maxY - minY, 0.01),
    );
    const w = h * 3;
    return {
      virtualWidth: w,
      virtualHeight: h,
      offsetX: (w * (minX + maxX)) / 2 - width / 2,
      offsetY: (h * (minY + maxY)) / 2 - canvasHeight / 2,
    };
  }, [width, canvasHeight]);
  const point = (e: GestureResponderEvent) => [
    Math.max(
      0,
      Math.min(1, (e.nativeEvent.locationX + offsetX) / virtualWidth),
    ),
    Math.max(
      0,
      Math.min(1, (e.nativeEvent.locationY + offsetY) / virtualHeight),
    ),
  ];
  return (
    <View style={{ gap: 8 }}>
      <Text>{label}</Text>
      <View
        accessibilityLabel={label}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{
          width: "100%",
          height: canvasHeight,
          backgroundColor: "white",
          borderWidth: 1,
          borderColor: "#75695c",
          borderRadius: 8,
          overflow: "hidden",
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
          if (Math.hypot(p[0] - previous[0], p[1] - previous[1]) < 0.003)
            return;
          drawing.current = [...current.slice(0, -1), [...stroke, p]];
          onChange(drawing.current);
        }}
        onResponderRelease={() => {
          if (drawing.current)
            onChange(drawing.current.filter((stroke) => stroke.length > 1));
          drawing.current = null;
        }}
        onResponderTerminate={() => {
          if (drawing.current) onChange(drawing.current.slice(0, -1));
          drawing.current = null;
        }}
      >
        <View pointerEvents="none" style={{ position: "absolute", inset: 0 }}>
          {value.flatMap((stroke, s) =>
            stroke.slice(1).map((p, i) => {
              const a = stroke[i],
                dx = (p[0] - a[0]) * virtualWidth,
                dy = (p[1] - a[1]) * virtualHeight;
              const length = Math.hypot(dx, dy);
              return (
                <View
                  key={`${s}-${i}`}
                  style={{
                    position: "absolute",
                    left:
                      ((a[0] + p[0]) * virtualWidth) / 2 - offsetX - length / 2,
                    top: ((a[1] + p[1]) * virtualHeight) / 2 - offsetY - 1,
                    width: length,
                    height: 2,
                    backgroundColor: "#14213d",
                    borderRadius: 1,
                    transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
                  }}
                />
              );
            }),
          )}
        </View>
      </View>
      {!disabled && (
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
      )}
    </View>
  );
}

/** Drawing lives outside the parent ScrollView; edits commit only on validation. */
export function SignaturePad({
  value,
  onChange,
  label,
  disabled = false,
  inline = false,
  readOnly = false,
}: {
  value: Signature;
  onChange: (value: Signature) => void;
  label: string;
  disabled?: boolean;
  inline?: boolean;
  readOnly?: boolean;
}) {
  const window = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Signature>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const landscape = size.width > size.height;
  const action = (title: string, onPress: () => void, inactive = false) => (
    <Pressable
      accessibilityRole="button"
      disabled={inactive}
      onPress={onPress}
      style={{
        padding: 14,
        borderRadius: 8,
        backgroundColor: "#f8ecd6",
        opacity: inactive ? 0.5 : 1,
      }}
    >
      <Text>{title}</Text>
    </Pressable>
  );
  if (readOnly)
    return (
      <SignatureCanvas
        label={label}
        value={value}
        onChange={() => {}}
        disabled
      />
    );
  if (inline)
    return (
      <View style={{ gap: 12 }}>
        <SignatureCanvas
          label={label}
          value={value}
          onChange={onChange}
          disabled={disabled}
          height={window.width > window.height ? 180 : 220}
        />
        <Text style={{ color: "#6b6b73", fontSize: 13 }}>
          Signez au doigt ou au stylet. Tournez le téléphone pour agrandir le
          cadre.
        </Text>
      </View>
    );
  return (
    <View style={{ gap: 10 }}>
      <SignatureCanvas
        label={label}
        value={value}
        onChange={() => {}}
        disabled
      />
      {action(
        value.length
          ? "Modifier la signature en plein écran"
          : "Signer en plein écran",
        () => {
          setDraft(value);
          setOpen(true);
        },
        disabled,
      )}
      {!!value.length &&
        action("Effacer la signature", () => onChange([]), disabled)}
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="fullScreen"
        supportedOrientations={[
          "portrait",
          "landscape-left",
          "landscape-right",
        ]}
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView
          style={{ flex: 1, backgroundColor: "#f2f2f7" }}
          onLayout={(event) => setSize(event.nativeEvent.layout)}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              paddingHorizontal: 12,
              gap: 8,
            }}
          >
            {action("Annuler", () => setOpen(false))}
            {action(
              "Valider la signature",
              () => {
                onChange(draft);
                setOpen(false);
              },
              disabled || !validSignature(draft),
            )}
          </View>
          {landscape ? (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                padding: 8,
              }}
            >
              <View
                style={{
                  width: Math.max(
                    0,
                    Math.min(size.width - 32, (size.height - 150) * 3),
                  ),
                }}
              >
                <SignatureCanvas
                  label={label}
                  value={draft}
                  onChange={setDraft}
                  disabled={disabled}
                />
              </View>
            </View>
          ) : (
            <View
              style={{
                flex: 1,
                justifyContent: "center",
                padding: 20,
                gap: 20,
              }}
            >
              <Text style={{ fontSize: 24, fontWeight: "600" }}>
                Votre signature
              </Text>
              <SignatureCanvas
                label={label}
                value={draft}
                onChange={setDraft}
                disabled={disabled}
              />
              <Text style={{ color: "#6b6b73" }}>
                Tournez le téléphone à l’horizontale pour agrandir le cadre.
              </Text>
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}
