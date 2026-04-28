
import React from 'react';

interface AddressModalProps {
  isOpen: boolean;
  zipcode: string;
  houseNumber: string;
  onZipcodeChange: (val: string) => void;
  onHouseNumberChange: (val: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

const AddressModal: React.FC<AddressModalProps> = (props) => {
  if (!props.isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-md p-4">
      <div className="bg-white rounded-[2.5rem] p-10 w-full max-w-lg shadow-2xl flex flex-col overflow-hidden animate-in zoom-in duration-300">
        <h3 className="text-2xl font-black uppercase mb-6 tracking-tighter">Nieuw Project Starten</h3>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6 leading-relaxed">Geef het adres van de woning op.</p>
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Postcode</label>
            <input 
              autoFocus 
              type="text" 
              className="bg-gray-50 border border-gray-200 p-4 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-100 transition-all font-black text-gray-900 placeholder:text-gray-300 uppercase" 
              placeholder="bijv. 1234AB" 
              value={props.zipcode} 
              onChange={(e) => props.onZipcodeChange(e.target.value)} 
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Huisnummer</label>
            <input 
              type="text" 
              className="bg-gray-50 border border-gray-200 p-4 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-100 transition-all font-black text-gray-900 placeholder:text-gray-300" 
              placeholder="bijv. 42a" 
              value={props.houseNumber} 
              onChange={(e) => props.onHouseNumberChange(e.target.value)} 
              onKeyDown={(e) => e.key === 'Enter' && props.onConfirm()} 
            />
          </div>
        </div>
        <div className="flex gap-4">
          <button onClick={props.onClose} className="flex-1 p-5 font-black uppercase text-gray-400 hover:text-gray-900 transition-colors">Annuleren</button>
          <button onClick={props.onConfirm} className="flex-[2] p-5 bg-emerald-600 text-white font-black rounded-2xl uppercase shadow-lg hover:bg-emerald-700 transition-all active:scale-95">Zoek Woning</button>
        </div>
      </div>
    </div>
  );
};

export default AddressModal;
