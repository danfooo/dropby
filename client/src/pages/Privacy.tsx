import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';

export default function Privacy() {
  const { user } = useAuthStore();
  const backTo = user ? '/profile' : '/about';

  return (
    <div className="min-h-full bg-white px-6 py-10 max-w-sm mx-auto">
      <Link to={backTo} className="text-sm text-gray-400 hover:text-gray-600 mb-8 block">
        ← Back
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">Privacy Policy</h1>
      <p className="text-xs text-gray-400 mb-10">Last updated: March 2026</p>

      <div className="space-y-8 text-sm text-gray-700 leading-relaxed">

        <section>
          <h2 className="font-semibold text-gray-900 mb-2">Who is responsible</h2>
          <p>
            dropby is operated by Daniel Herzog, Parkstr. 5, 42697 Solingen, Germany
            (<a href="mailto:hi@dropby.cc" className="text-emerald-600 hover:underline">hi@dropby.cc</a>).
            He is the data controller under GDPR.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900 mb-2">What we collect and why</h2>
          <div className="space-y-4">
            <div>
              <p className="font-medium text-gray-800">Account data</p>
              <p className="text-gray-600">Your email address, display name, and (if you sign in with Google) your Google account ID. Used to identify you and let your friends find you. Kept for as long as your account exists.</p>
            </div>
            <div>
              <p className="font-medium text-gray-800">Activity data</p>
              <p className="text-gray-600">When you open your door, we store the time, any note you add, who you invite, and whether friends say they're coming. This is the core of the product. Deleted when you delete your account.</p>
            </div>
            <div>
              <p className="font-medium text-gray-800">Friend connections</p>
              <p className="text-gray-600">When you and another person both accept each other's invite, we store that friendship. Deleted if either of you removes the other or deletes their account.</p>
            </div>
            <div>
              <p className="font-medium text-gray-800">Guest contact info</p>
              <p className="text-gray-600">If someone without an account says they're coming and provides their name or email/phone, we store it so the host knows who to expect. We only contact them if they explicitly asked for the app link.</p>
            </div>
            <div>
              <p className="font-medium text-gray-800">Push notification tokens</p>
              <p className="text-gray-600">If you enable push notifications, we store a device token to send you alerts. Deleted when you remove it or delete your account.</p>
            </div>
            <div>
              <p className="font-medium text-gray-800">Profile photo</p>
              <p className="text-gray-600">Only if you choose to upload one. Stored on our server and shown to your friends.</p>
            </div>
            <div>
              <p className="font-medium text-gray-800">Timezone and language</p>
              <p className="text-gray-600">Stored to send notifications at sensible times and to show the app in your language.</p>
            </div>
            <div>
              <p className="font-medium text-gray-800">Feedback</p>
              <p className="text-gray-600">If you submit feedback through the app, we store your message and, optionally, your email if you want a reply.</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900 mb-2">What we don't do</h2>
          <ul className="list-disc list-inside space-y-1 text-gray-600">
            <li>We don't sell your data.</li>
            <li>We don't run ads.</li>
            <li>We don't use third-party analytics or tracking cookies.</li>
            <li>We don't share your data with anyone except where strictly required to run the service (see below).</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900 mb-2">Third parties</h2>
          <div className="space-y-3 text-gray-600">
            <p><span className="font-medium text-gray-800">Fly.io</span> — our hosting provider. Your data is stored on their servers. <a href="https://fly.io/legal/privacy-policy/" className="text-emerald-600 hover:underline" target="_blank" rel="noopener noreferrer">Their privacy policy</a>.</p>
            <p><span className="font-medium text-gray-800">Google</span> — if you sign in with Google, Google processes your sign-in. We only receive your email, name, and a Google account ID. <a href="https://policies.google.com/privacy" className="text-emerald-600 hover:underline" target="_blank" rel="noopener noreferrer">Google's privacy policy</a>.</p>
            <p><span className="font-medium text-gray-800">Apple / Google (push notifications)</span> — push notifications are delivered via Apple APNs or Google Firebase, which process your device token.</p>
          </div>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900 mb-2">Legal basis (GDPR)</h2>
          <p className="text-gray-600">We process your data to perform the service you signed up for (Art. 6(1)(b) GDPR). Feedback is processed based on your consent. Marketing messages to guest users require explicit opt-in consent (Art. 6(1)(a) GDPR).</p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900 mb-2">Your rights</h2>
          <p className="text-gray-600 mb-3">Under GDPR, you have the right to:</p>
          <ul className="list-disc list-inside space-y-1 text-gray-600">
            <li>Access the data we hold about you</li>
            <li>Correct inaccurate data</li>
            <li>Delete your account and all associated data (available directly in the app under Profile)</li>
            <li>Export your data</li>
            <li>Object to or restrict processing</li>
            <li>Lodge a complaint with your national data protection authority</li>
          </ul>
          <p className="text-gray-600 mt-3">
            To exercise any of these rights, email{' '}
            <a href="mailto:hi@dropby.cc" className="text-emerald-600 hover:underline">hi@dropby.cc</a>.
            We'll respond within 30 days.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900 mb-2">Data retention</h2>
          <p className="text-gray-600">We keep your data for as long as your account is active. If you delete your account, all personal data is deleted immediately. Server logs may be retained for up to 30 days for operational reasons.</p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900 mb-2">Changes to this policy</h2>
          <p className="text-gray-600">If we make material changes, we'll let you know via the app. The current version is always at this URL.</p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900 mb-2">Contact</h2>
          <p className="text-gray-600">
            Questions? Email{' '}
            <a href="mailto:hi@dropby.cc" className="text-emerald-600 hover:underline">hi@dropby.cc</a>.
          </p>
        </section>

      </div>
    </div>
  );
}
