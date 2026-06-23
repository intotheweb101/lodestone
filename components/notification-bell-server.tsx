import { getCurrentUser } from '@/lib/auth/session';
import { getNotifications, getUnreadCount } from '@/lib/social/store';
import { NotificationBell } from './notification-bell';

export async function NotificationBellServer() {
  const user = await getCurrentUser();
  if (!user || user.id === 'local') return null;

  const notifications = getNotifications(user.id);
  const unreadCount = getUnreadCount(user.id);

  return <NotificationBell notifications={notifications} unreadCount={unreadCount} />;
}
