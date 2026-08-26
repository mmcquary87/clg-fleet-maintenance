export default function EmptyState({ icon: Icon, title, body }) {
  return (
    <div className="empty">
      {Icon && <Icon size={26} strokeWidth={1.5} />}
      <div className="empty-title">{title}</div>
      <div className="empty-body">{body}</div>
    </div>
  );
}
