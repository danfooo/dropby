import { useMemo, useState, useEffect } from 'react';
import { createAvatar } from '@dicebear/core';
import * as shapes from '@dicebear/shapes';
import { Capacitor } from '@capacitor/core';

const SERVER = 'https://drop-by.fly.dev';

interface Props {
  name: string;
  url?: string | null;
  seed?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeMap = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-14 h-14',
  xl: 'w-24 h-24',
};

export default function Avatar({ name, url, seed, size = 'md', className = '' }: Props) {
  // Uploaded avatars are stored as server-relative paths; on native there's no
  // same-origin server to resolve them against.
  const resolvedUrl = url && url.startsWith('/') && Capacitor.isNativePlatform()
    ? `${SERVER}${url}`
    : url;

  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [resolvedUrl]);

  const useGenerated = !resolvedUrl || failed;
  const generated = useMemo(
    () =>
      useGenerated
        ? createAvatar(shapes, {
            seed: seed ?? name,
            size: 128,
            backgroundColor: ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf'],
          }).toString()
        : null,
    [name, seed, useGenerated],
  );

  const src = useGenerated
    ? `data:image/svg+xml;utf8,${encodeURIComponent(generated!)}`
    : resolvedUrl!;

  return (
    <img
      src={src}
      alt={name}
      onError={() => setFailed(true)}
      className={`${sizeMap[size]} rounded-full shrink-0 object-cover ${className}`}
    />
  );
}
