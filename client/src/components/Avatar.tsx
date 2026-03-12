import { useMemo } from 'react';
import { createAvatar } from '@dicebear/core';
import * as shapes from '@dicebear/shapes';

interface Props {
  name: string;
  seed?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-14 h-14',
};

export default function Avatar({ name, seed, size = 'md', className = '' }: Props) {
  const svg = useMemo(() => {
    return createAvatar(shapes, {
      seed: seed ?? name,
      size: 128,
      backgroundColor: ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf'],
    }).toString();
  }, [name, seed]);

  const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

  return (
    <img
      src={dataUri}
      alt={name}
      className={`${sizeMap[size]} rounded-full flex-shrink-0 ${className}`}
    />
  );
}
