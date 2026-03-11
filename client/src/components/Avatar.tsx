interface Props {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: 'w-8 h-8 text-sm',
  md: 'w-10 h-10 text-base',
  lg: 'w-14 h-14 text-xl',
};

export default function Avatar({ name, size = 'md', className = '' }: Props) {
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <div className={`${sizeMap[size]} rounded-full bg-emerald-100 text-emerald-700 font-semibold flex items-center justify-center flex-shrink-0 ${className}`}>
      {initial}
    </div>
  );
}
