import UserMenu from './UserMenu';

export default function PageHeader({ className = 'mb-6' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <img src="/logo-icon.svg" alt="dropby" className="h-8 dark:[filter:invert(1)]" />
      <UserMenu />
    </div>
  );
}
