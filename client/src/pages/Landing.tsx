import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="min-h-full flex flex-col bg-white">
      {/* Top spacer */}
      <div className="flex-1" />

      {/* Hero */}
      <div className="flex flex-col items-center px-6 py-8 text-center">
        <div className="w-16 h-16 bg-emerald-500 rounded-3xl flex items-center justify-center mb-4 shadow-lg">
          <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205l3 1m1.5.5l-1.5-.5M6.75 7.364V3h-3v18m3-13.636l10.5-3.819" />
          </svg>
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Drop By</h1>
        <p className="text-lg text-gray-500 max-w-xs leading-relaxed">
          One tap tells your friends you're open to a spontaneous visit.
        </p>
        <p className="mt-1.5 text-gray-400 text-sm">No plans. No group chats. Just "swing by."</p>
      </div>

      {/* How it works */}
      <div className="px-6 py-8 border-t border-gray-100">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest text-center mb-4">How it works</h2>
        <div className="space-y-4 max-w-sm mx-auto">
          {[
            {
              step: '1',
              icon: '🚪',
              title: 'Open your door',
              desc: 'Pick a vibe and tap open. Your door\'s open for 30 minutes.',
            },
            {
              step: '2',
              icon: '🔗',
              title: 'Share the link',
              desc: 'Send it to whoever might want to swing by.',
            },
            {
              step: '3',
              icon: '👋',
              title: 'They drop by',
              desc: 'No planning, no back and forth. Just a visit.',
            },
          ].map(item => (
            <div key={item.step} className="flex gap-4 items-start">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-lg flex-shrink-0">
                {item.icon}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{item.title}</p>
                <p className="text-sm text-gray-500 mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom spacer */}
      <div className="flex-1" />

      {/* CTA */}
      <div className="px-6 pt-2 pb-12">
        <Link
          to="/auth"
          className="block w-full bg-emerald-500 hover:bg-emerald-600 text-white text-center py-4 rounded-2xl font-semibold text-lg transition-colors"
        >
          Get started
        </Link>
      </div>
    </div>
  );
}
