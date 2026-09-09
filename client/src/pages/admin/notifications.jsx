import NotificationAdmin from '../NotificationAdmin';
import AdminLayout from './layout';

export default function AdminNotifications() {
  return (
    <AdminLayout active="push">
      <div className="ac-push-host">
        <NotificationAdmin />
      </div>
    </AdminLayout>
  );
}