
import React, { useState, useEffect, useRef } from 'react';

interface EditableTextProps {
  value: string;
  onSave: (val: string) => void;
  className?: string;
  placeholder?: string;
}

const EditableText: React.FC<EditableTextProps> = ({ 
  value, 
  onSave, 
  className = "", 
  placeholder = "Typ hier..." 
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTempValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const handleBlur = () => {
    setIsEditing(false);
    if (tempValue.trim() !== "" && tempValue !== value) {
      onSave(tempValue.trim());
    } else {
      setTempValue(value); 
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleBlur();
    if (e.key === 'Escape') {
      setIsEditing(false);
      setTempValue(value);
    }
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        className={`bg-transparent border-b border-emerald-500 outline-none w-full py-0 px-0 ${className}`}
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
    );
  }

  return (
    <div 
      className={`group relative cursor-pointer inline-flex items-center gap-2 max-w-full hover:bg-gray-50 rounded px-1 -ml-1 transition-colors ${className}`}
      onClick={() => setIsEditing(true)}
      title="Klik om te bewerken"
    >
      <span className="truncate">{value || placeholder}</span>
      <svg className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
      </svg>
    </div>
  );
};

export default EditableText;
