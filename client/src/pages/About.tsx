import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';

export default function About() {
  const { user } = useAuthStore();
  const backTo = user ? '/profile' : '/';

  return (
    <div className="min-h-full bg-white dark:bg-gray-950 px-6 py-10">
      <div className="max-w-lg mx-auto">
        <Link to={backTo} className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mb-8 block">
          ← Back
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-1">dropby</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-10">Spend more time with friends.</p>

        <section className="mb-8">
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Imprint / Impressum</h2>
          <div className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <p className="font-medium">Daniel Herzog</p>
            <p>Parkstr. 5</p>
            <p>42697 Solingen</p>
            <p>Germany</p>
          </div>
          <div className="mt-4 text-sm text-gray-700 dark:text-gray-300">
            <p>
              <span className="text-gray-500 dark:text-gray-400">E-Mail: </span>
              <a href="mailto:hi@dropby.cc" className="text-emerald-600 dark:text-emerald-400 hover:underline">hi@dropby.cc</a>
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Privacy</h2>
          <Link to="/privacy" className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline">
            Privacy Policy →
          </Link>
        </section>
      </div>
    </div>
  );
}
