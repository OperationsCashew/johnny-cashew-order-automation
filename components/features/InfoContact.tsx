
import React, { useState } from 'react';

const SectionHeader = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <div className="border-b border-slate-100 pb-8">
    <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-2">{title}</h3>
    <p className="text-xs font-black text-emerald-600 uppercase tracking-widest">{subtitle}</p>
  </div>
);

const ContactCard = ({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) => (
  <a href={`mailto:${value}`} className="p-6 bg-white border border-slate-100 rounded-3xl shadow-sm flex items-center gap-4 group hover:border-emerald-200 hover:shadow-md transition-all cursor-pointer">
    <div className="w-10 h-10 bg-slate-50 text-slate-400 group-hover:text-emerald-500 group-hover:bg-emerald-50 rounded-xl flex items-center justify-center transition-colors">
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">{icon}</svg>
    </div>
    <div>
      <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{title}</span>
      <span className="text-sm font-black text-emerald-700 uppercase tracking-tight group-hover:text-emerald-500 transition-colors">{value}</span>
    </div>
  </a>
);

const InfoContact: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const subject = encodeURIComponent(`Vraag van ${name} via VerbouwScan`);
    const body = encodeURIComponent(`Naam: ${name}\nE-mail: ${email}\n\n${message}`);
    window.location.href = `mailto:info@verbouwscan.com?subject=${subject}&body=${body}`;
    setSent(true);
  };

  const inputClass = "w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 placeholder:text-slate-300 placeholder:font-medium focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all";

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-8">
      <SectionHeader title="Neem contact op" subtitle="Heb je vragen over de ramingen of technische hulp nodig?" />

      <div className="grid grid-cols-1 gap-6">
        <ContactCard
          title="Algemene Vragen"
          value="info@verbouwscan.com"
          icon={<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>}
        />
      </div>

      {/* Contactformulier */}
      <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-100">
          <h4 className="text-sm font-black text-slate-900 uppercase tracking-tighter">Stuur een bericht</h4>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">We reageren binnen 1 werkdag</p>
        </div>
        {sent ? (
          <div className="px-8 py-10 flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Je e-mailclient is geopend</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Verstuur het bericht vanuit je e-mailprogramma</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-8 py-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Naam</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Je naam"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">E-mailadres</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="je@email.nl"
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Bericht</label>
              <textarea
                required
                rows={4}
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Stel je vraag of omschrijf je situatie..."
                className={`${inputClass} resize-none`}
              />
            </div>
            <button
              type="submit"
              className="w-full py-3.5 px-6 bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] text-white text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-sm"
            >
              Verstuur bericht →
            </button>
          </form>
        )}
      </div>

      <div className="p-8 bg-emerald-50 rounded-[2rem] border border-emerald-100">
        <h4 className="text-sm font-black text-emerald-900 uppercase tracking-tight mb-2">Wist je dat?</h4>
        <p className="text-xs font-bold text-emerald-700/70 leading-relaxed uppercase tracking-widest">
          Onder elk AI advies in de zijbalk staat een blauwe knop waarmee je in één keer al het AI advies voor een kamer kunt doorvoeren
        </p>
      </div>
    </div>
  );
};

export default InfoContact;
