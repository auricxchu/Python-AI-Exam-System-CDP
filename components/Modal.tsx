import React from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeOnOutsideClick?: boolean;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, footer, closeOnOutsideClick = true }) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={closeOnOutsideClick ? onClose : undefined}
    >
      <div 
        className="bg-slate-800 border border-slate-700 rounded-xl max-w-md w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b border-slate-700 bg-slate-900/50">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 text-slate-300">
          {children}
        </div>

        {footer && (
          <div className="p-4 border-t border-slate-700 bg-slate-900/30 flex justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;
