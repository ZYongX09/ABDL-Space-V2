import { useState } from 'react'

/**
 * 纸尿裤图片组件 — 针对方形图片优化
 * 方形：居中显示，不撑满高度
 * 长方形：适应高度，裁切边缘保持整洁
 */
export function DiaperImage({ src, alt, className, style, maxHeight, onError }) {
  const [aspectRatio, setAspectRatio] = useState(null)

  const handleLoad = (e) => {
    const { naturalWidth, naturalHeight } = e.target
    if (naturalWidth && naturalHeight) {
      setAspectRatio(naturalWidth / naturalHeight)
    }
  }

  const isSquare = aspectRatio !== null && Math.abs(aspectRatio - 1) < 0.15

  return (
    <div
      className={className}
      style={{
        maxHeight: maxHeight ?? 160,
        overflow: 'hidden',
        ...style,
      }}
    >
      <img
        src={src}
        alt={alt}
        onLoad={handleLoad}
        onError={onError}
        style={{
          width: '100%',
          height: '100%',
          objectFit: isSquare ? 'contain' : 'cover',
          background: 'var(--input-bg)',
          display: 'block',
        }}
      />
    </div>
  )
}