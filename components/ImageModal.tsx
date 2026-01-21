
import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';

interface ImageModalProps {
  src: string;
  alt?: string;
  isOpen: boolean;
  onClose: () => void;
}

const ImageModal: React.FC<ImageModalProps> = ({ src, isOpen, onClose, alt }) => {
  const [scale, setScale] = useState(1);
  const minScale = 1;
  const maxScale = 4;
  const step = 0.15;

  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) setScale(1);
  }, [isOpen, src]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -step : step;
    setScale(prev => Math.max(minScale, Math.min(maxScale, prev + delta)));
  };

  const handleDoubleClick = () => {
    setScale(prev => (prev > 1 ? 1 : 2));
  };

  const imgStyle = useMemo(
    () => ({ transform: `scale(${scale})` }),
    [scale]
  );

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200 cursor-zoom-out"
      onClick={onClose}
      onWheel={handleWheel}
    >
      <button 
        className="absolute top-6 right-6 text-white/50 hover:text-white p-2 transition-colors z-[101]" 
        onClick={onClose}
      >
        <X className="w-8 h-8" />
      </button>
      
      <img 
        src={src} 
        alt={alt || "Full view"} 
        className="max-w-[95vw] max-h-[95vh] object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-300 cursor-default select-none bg-slate-900 transition-transform"
        style={imgStyle}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={handleDoubleClick}
      />
    </div>
  );
};

export default ImageModal;
