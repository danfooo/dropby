import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import Avatar from './Avatar';

export default function UserMenu() {
  const { user } = useAuthStore();
  if (!user) return null;
  const firstName = user.display_name.split(' ')[0];
  return (
    <Link to="/profile" className="flex items-center gap-2 py-1 px-1 -mr-1 rounded-2xl hover:bg-gray-100 transition-colors">
      <Avatar name={user.display_name} url={user.avatar_url} size="sm" />
      <span className="text-sm font-medium text-gray-700 pr-1">{firstName}</span>
    </Link>
  );
}
