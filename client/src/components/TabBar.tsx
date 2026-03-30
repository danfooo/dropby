import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { statusApi } from '../api';

export default function TabBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const { data: upcoming = [] } = useQuery({
    queryKey: ['upcomingSessions'],
    queryFn: statusApi.getUpcoming,
    staleTime: 60000,
  });
  const { data: friendStatuses = [] } = useQuery({
    queryKey: ['friendStatuses'],
    queryFn: statusApi.getFriends,
    staleTime: 60000,
  });

  const nowTs = Math.floor(Date.now() / 1000);
  const scheduledFriendCount = (friendStatuses as any[]).filter((s: any) => s.starts_at && s.starts_at > nowTs).length;
  const badge = (upcoming as any[]).length + scheduledFriendCount;

  return (
    <nav className="bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 safe-bottom">
      <div className="flex">
        {/* Now tab */}
        <NavLink
          to="/home"
          onClick={(e) => {
            if (location.pathname === '/home') {
              e.preventDefault();
              navigate('/home', { replace: true, state: { exitEdit: Date.now() } });
            }
          }}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center py-3 text-xs font-medium transition-colors ${
              isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'
            }`
          }
        >
          <svg className="w-6 h-6 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>
          {t('nav.now')}
        </NavLink>

        {/* Later tab */}
        <NavLink
          to="/upcoming"
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center py-3 text-xs font-medium transition-colors ${
              isActive ? 'text-violet-600 dark:text-violet-400' : 'text-gray-400 dark:text-gray-500'
            }`
          }
        >
          <div className="relative mb-0.5">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {badge > 0 && (
              <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 bg-violet-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                {badge <= 9 ? badge : '·'}
              </span>
            )}
          </div>
          {t('nav.later')}
        </NavLink>

        {/* Friends tab */}
        <NavLink
          to="/friends"
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center py-3 text-xs font-medium transition-colors ${
              isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'
            }`
          }
        >
          <svg className="w-6 h-6 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
          {t('nav.friends')}
        </NavLink>
      </div>
    </nav>
  );
}
