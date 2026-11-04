import { forwardRef } from 'react';
import { nbwURLSuffix, resolveNBWDisplayURL } from '../utils/nbwEndpoints.js';
import { useNBWEndpoints } from '../utils/useNBWEndpoints.js';

// 只在实际图片展示点派生 NBW origin；不更改账户/帖子原对象或头像编辑提交值。
const ResolvedNBWImage = forwardRef(function ResolvedNBWImage({ src, alt = '', ...props }, ref) {
  const { endpoints } = useNBWEndpoints();
  return <img {...props} ref={ref} alt={alt} src={resolveNBWDisplayURL(src, endpoints, 'media')} />;
});
const NBWImage = forwardRef(function NBWImage({ src, alt = '', ...props }, ref) {
  // 非 NBW 图片不订阅 store，更不触发 IO。只有实际 NBW 展示源随快照重渲染。
  return nbwURLSuffix(src) === null ? <img {...props} ref={ref} alt={alt} src={src} />
    : <ResolvedNBWImage {...props} ref={ref} alt={alt} src={src} />;
});
export default NBWImage;
