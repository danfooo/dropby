import { useMemo } from 'react';
import { createAvatar } from '@dicebear/core';
import * as shapes from '@dicebear/shapes';
import { Capacitor } from '@capacitor/core';

const SERVER = 'https://drop-by.fly.dev';

interface Props {
  name: string;
  url?: string | null;
  seed?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-14 h-14',
};

export default function Avatar({ name, url, seed, size = 'md', className = '' }: Props) {
  const svg = useMemo(() => {
    if (url) return null;
    return createAvatar(shapes, {
      seed: seed ?? name,
      size: 128,
      backgroundColor: ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf'],
    }).toString();
  }, [name, seed, url]);

  const resolvedUrl = url && url.startsWith('/') && Capacitor.isNativePlatform()
    ? `${SERVER}${url}`
    : url;
  const src = resolvedUrl || `data:image/svg+xml;utf8,${encodeURIComponent(svg!)}`;

  return (
    <img
      src={src}
      alt={name}
      className={`${sizeMap[size]} rounded-full flex-shrink-0 object-cover ${className}`}
    />
  );
}
