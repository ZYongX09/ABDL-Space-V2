import PageLayout from '../components/PageLayout';
import { EmptyState } from '../components/Feedback';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';

export default function MessagesPage() {
  const { user } = useAuth();

  if (!user) {
    return (
      <PageLayout hero={{ icon: 'fa-envelope', title: '私信' }}>
        <div className="empty-state">
          <div className="icon"><i className="fa-solid fa-comment-dots" /></div>
          <h3>请先登录</h3>
          <Link to="/login" className="btn btn-primary mt-4">去登录</Link>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout hero={{ icon: 'fa-envelope', title: '私信' }}>
      <EmptyState icon="fa-inbox" title="暂无私信" description="与其他用户互动后，私信会出现在这里" />
    </PageLayout>
  );
}
