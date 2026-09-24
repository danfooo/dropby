import Avatar from './Avatar';

// Recipient row in door-open view
export default function RecipientRow({ recipient }: { recipient: any }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <Avatar name={recipient.display_name} url={recipient.avatar_url} size="sm" />
      <span className="flex-1 text-sm text-gray-900 dark:text-gray-50">
        {recipient.display_name}
      </span>
    </div>
  );
}
