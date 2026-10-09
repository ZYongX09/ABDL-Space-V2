import { Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import ErrorBoundary from '../../components/ErrorBoundary';
import ToastPopup from '../../components/ToastPopup';
import MerchantCenter from '../MerchantCenter';

function MerchantUnknownRoute() {
  return <div className="merchant-host-state"><i className="fa-solid fa-route" aria-hidden="true" /><h1>商家页面不存在</h1><p>请从商家服务中心导航进入。</p><a href="/merchant">返回商家服务中心</a></div>;
}

export default function MerchantHost() {
  return <div className="merchant-host ac-admin-theme" data-merchant-host>
    <ErrorBoundary>
      <Suspense fallback={<div className="merchant-host-state" role="status">正在加载商家服务中心…</div>}>
        <Routes>
          <Route path="/merchant" element={<MerchantCenter />} />
          <Route path="*" element={<MerchantUnknownRoute />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
    <ToastPopup />
  </div>;
}
