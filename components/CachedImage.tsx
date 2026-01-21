import React from 'react';
import { useResolvedImageUrl } from '../hooks/useResolvedImageUrl';

type CachedImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
};

const CachedImage: React.FC<CachedImageProps> = ({ src, ...props }) => {
  const resolved = useResolvedImageUrl(src);
  return <img {...props} src={resolved || src} />;
};

export default CachedImage;
