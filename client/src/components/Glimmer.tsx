// Slow shimmer over the violet gradient shown when a door is open. Blends with the
// gradient and barely touches opaque cards.
export default function Glimmer() {
  return (
    <div
      className="pointer-events-none absolute -inset-4"
      style={{
        animation: 'glimmer 6s ease-in-out infinite',
        background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(255,255,255,0.28) 0%, transparent 100%)',
        mixBlendMode: 'overlay',
      }}
    />
  );
}
