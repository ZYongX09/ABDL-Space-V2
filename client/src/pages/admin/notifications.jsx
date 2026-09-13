import NotificationAdmin from '../NotificationAdmin';
import AdminLayout from './layout';

export default function AdminNotifications() {
  return (
    <AdminLayout active="push">
      <NotificationAdmin />
    </AdminLayout>
  );
}
