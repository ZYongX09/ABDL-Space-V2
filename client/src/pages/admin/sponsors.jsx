import { useAuth } from '../../contexts/AuthContext.jsx';
import AdminLayout from './layout.jsx';
import SponsorAdmin from '../../sponsors/SponsorAdmin.jsx';

export default function AdminSponsors() {
  const { user } = useAuth();
  return <AdminLayout active="sponsors">{user?.role === 'admin' && <SponsorAdmin key={user.id} />}</AdminLayout>;
}
