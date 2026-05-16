import React from 'react';
import { Loader2 } from 'lucide-react';

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { isLoading?: boolean, variant?: 'primary' | 'secondary' | 'danger' | 'success' }> = ({ 
  children, 
  className = "", 
  isLoading, 
  variant = 'primary', 
  disabled, 
  ...props 
}) => {
  const baseStyles = "px-4 py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-blue-600 hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-900/20 text-white",
    secondary: "bg-slate-700 hover:bg-slate-600 text-white border border-slate-600",
    danger: "bg-red-600 hover:bg-red-500 hover:shadow-lg hover:shadow-red-900/20 text-white",
    success: "bg-green-600 hover:bg-green-500 hover:shadow-lg hover:shadow-green-900/20 text-white",
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${className}`} 
      disabled={isLoading || disabled} 
      {...props}
    >
      {isLoading && <Loader2 className="animate-spin w-4 h-4" />}
      {children}
    </button>
  );
};

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label?: string }> = ({ label, className = "", ...props }) => (
  <div className="w-full">
    {label && <label className="block text-slate-400 text-xs mb-1.5 font-medium">{label}</label>}
    <input 
      className={`w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all ${className}`}
      {...props}
    />
  </div>
);

export const Badge: React.FC<{ children: React.ReactNode, color: 'green' | 'yellow' | 'red' | 'blue' | 'slate' }> = ({ children, color }) => {
  const colors = {
    green: 'bg-green-900/30 text-green-400 border-green-800',
    yellow: 'bg-yellow-900/30 text-yellow-400 border-yellow-800',
    red: 'bg-red-900/30 text-red-400 border-red-800',
    blue: 'bg-blue-900/30 text-blue-400 border-blue-800',
    slate: 'bg-slate-800 text-slate-400 border-slate-700',
  };
  
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded border ${colors[color]} font-medium uppercase tracking-wider`}>
      {children}
    </span>
  );
};
