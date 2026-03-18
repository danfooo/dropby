import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';

export default function About() {
  const { user } = useAuthStore();
  const backTo = user ? '/profile' : '/';

  return (
    <div className="min-h-full bg-white px-6 py-10 max-w-sm mx-auto">
      <Link to={backTo} className="text-sm text-gray-400 hover:text-gray-600 mb-8 block">
        ← Back
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">dropby</h1>
      <p className="text-gray-500 text-sm mb-10">Swing by whenever my door's open.</p>

      <section className="mb-8">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Imprint / Impressum</h2>
        <div className="space-y-1 text-sm text-gray-700">
          <p className="font-medium">Daniel Herzog</p>
          <p>Parkstr. 5</p>
          <p>42697 Solingen</p>
          <p>Germany</p>
        </div>
        <div className="mt-4 text-sm text-gray-700">
          <p>
            <span className="text-gray-500">E-Mail: </span>
            <a href="mailto:hi@dropby.cc" className="text-emerald-600 hover:underline">hi@dropby.cc</a>
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Privacy</h2>
        <Link to="/privacy" className="text-sm text-emerald-600 hover:underline">
          Privacy Policy →
        </Link>
      </section>
    </div>
  );
}
