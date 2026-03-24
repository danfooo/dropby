import { Outlet } from 'react-router-dom';
import TabBar from './TabBar';
import { ToastProvider } from '../contexts/toast';

export default function Layout() {
  return (
    <ToastProvider>
      <div className="flex flex-col h-full">
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
        <TabBar />
      </div>
    </ToastProvider>
  );
}
