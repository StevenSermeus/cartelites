import { useId, useRef } from 'react';
import type { Signature } from '../../../packages/domain/src/signature';
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
  const assistanceId = useId();
  const drawing = useRef<Signature | null>(null);
  const point = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    ];
  };
  return (
    <div>
      <p>{label}</p>
      <svg
        aria-label={label}
        aria-describedby={disabled ? undefined : assistanceId}
        role="img"
        viewBox="0 0 600 200"
        style={{
          width: '100%',
          maxWidth: 600,
          aspectRatio: '3 / 1',
          height: 'auto',
          display: 'block',
          background: 'var(--card)',
          border: '1px solid var(--input)',
          borderRadius: 8,
          touchAction: 'none',
          cursor: disabled ? 'default' : 'crosshair',
        }}
        onPointerDown={(e) => {
          if (
            value.length >= 80 ||
            disabled ||
            (e.pointerType === 'mouse' && e.button !== 0) ||
            drawing.current
          )
            return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = [...value, [point(e)]];
          onChange(drawing.current);
        }}
        onPointerMove={(e) => {
          if (!drawing.current || disabled) return;
          const strokes = drawing.current;
          if (strokes.flat().length >= 3000) return;
          const next = [...strokes.slice(0, -1), [...strokes[strokes.length - 1], point(e)]];
          drawing.current = next;
          onChange(next);
        }}
        onPointerUp={() => {
          if (drawing.current) onChange(drawing.current.filter((stroke) => stroke.length > 1));
          drawing.current = null;
        }}
        onPointerCancel={() => {
          if (drawing.current) onChange(drawing.current.slice(0, -1));
          drawing.current = null;
        }}
      >
        {value.map((s, i) => (
          <polyline
            key={i}
            points={s.map((p) => `${p[0] * 600},${p[1] * 200}`).join(' ')}
            fill="none"
            stroke="var(--card-foreground)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      {!disabled && (
        <p id={assistanceId} className="muted">
          Si vous ne pouvez pas tracer votre signature sur cet écran, demandez
          l’assistance de la boutique avant de continuer.
        </p>
      )}
      <button
        type="button"
        className="secondary"
        disabled={disabled}
        onClick={() => {
          drawing.current = null;
          onChange([]);
        }}
      >
        Effacer la signature
      </button>
    </div>
  );
}
