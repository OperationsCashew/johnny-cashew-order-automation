
import React, { useState } from 'react';
import { HouseMetadata } from '../../types';
import { supabase } from '../../services/supabaseClient';

interface QuoteRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  houseMetadata: HouseMetadata;
  totalCost: number;
  rawFml?: string | null;
  fundaUrl?: string | null;
  projectId?: string | null;
  reportHtml?: string | null;
}

const QuoteRequestModal: React.FC<QuoteRequestModalProps> = ({
  isOpen,
  onClose,
  houseMetadata,
  totalCost,
  rawFml,
  fundaUrl,
  projectId,
  reportHtml,
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    timeline: 'Snel mogelijk',
    message: '',
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const { data, error } = await supabase.functions.invoke('submit-quote', {
        body: {
          formData,
          houseMetadata,
          totalCost,
          fundaUrl:   fundaUrl   || null,
          rawFml:     rawFml     || null,
          projectId:  projectId  || null,
          reportHtml: reportHtml || null,
        },
      });

      if (error) throw new Error(error.message);

      // Log details in console for debugging
      if (data?.errors?.length) console.warn('Partial errors:', data.errors);
      if (data?.log?.length)    console.log('Steps:', data.log);

      setStep(2);
    } catch (err: any) {
      setSubmitError(err.message || 'Er is iets misgegaan. Probeer het opnieuw.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setSubmitError(null);
    setFormData({ name: '', email: '', phone: '', timeline: 'Snel mogelijk', message: '' });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
      <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in fade-in duration-300">

        {step === 1 ? (
          <div className="flex flex-col min-h-0">
            <div className="p-8 bg-slate-50 border-b border-slate-100 flex-shrink-0">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Offerte Aanvragen</h2>
                  <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mt-2">We nemen zo snel mogelijk contact met je op</p>
                </div>
                <button onClick={handleClose} className="p-2 text-slate-400 hover:text-slate-900 transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>

              <div className="mt-6 flex items-center gap-6 p-5 bg-white rounded-[2rem] border border-slate-200 shadow-sm">
                <div className="flex-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Project Adres</span>
                  <span className="text-sm font-black text-slate-800 uppercase">{houseMetadata.address || 'Adres onbekend'}</span>
                  {fundaUrl && (
                    <a href={fundaUrl} target="_blank" rel="noreferrer" className="text-[10px] text-blue-500 font-bold mt-1 block truncate hover:underline">
                      Bekijk op Funda ↗
                    </a>
                  )}
                </div>
                <div className="h-10 w-px bg-slate-100" />
                <div className="text-right">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Geraamde Kosten</span>
                  <span className="text-lg font-black text-emerald-600 tracking-tighter">€ {Math.round(totalCost).toLocaleString('nl-NL')}</span>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-5 overflow-y-auto flex-1">
              <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
                <svg className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z"/></svg>
                <p className="text-[11px] font-semibold text-slate-500 leading-relaxed">
                  Alleen de <strong className="text-slate-700">werkzaamheden</strong> worden gedeeld met de aannemer — de kostencalculatie blijft vertrouwelijk.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Naam</label>
                  <input
                    required
                    type="text"
                    className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-100 font-bold transition-all"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Je volledige naam"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Telefoon</label>
                  <input
                    required
                    type="tel"
                    className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-100 font-bold transition-all"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="06 12345678"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail</label>
                <input
                  required
                  type="email"
                  className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-100 font-bold transition-all"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  placeholder="e-mail@voorbeeld.nl"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Gewenste tijdlijn</label>
                <select
                  className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-100 font-bold transition-all"
                  value={formData.timeline}
                  onChange={e => setFormData({ ...formData, timeline: e.target.value })}
                >
                  <option>Snel mogelijk</option>
                  <option>Binnen 3 maanden</option>
                  <option>Binnen 6 maanden</option>
                  <option>Oriënterend</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Toelichting (Optioneel)</label>
                <textarea
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-100 font-bold transition-all resize-none"
                  value={formData.message}
                  onChange={e => setFormData({ ...formData, message: e.target.value })}
                  placeholder="Heb je specifieke wensen of vragen?"
                />
              </div>

              {submitError && (
                <div className="bg-red-50 border border-red-100 text-red-600 text-sm font-semibold rounded-2xl p-4">
                  ⚠ {submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-5 bg-emerald-600 text-white font-black rounded-[1.5rem] uppercase tracking-widest shadow-xl shadow-emerald-500/20 hover:bg-emerald-700 hover:scale-[1.02] transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:scale-100 flex items-center justify-center gap-3"
              >
                {isSubmitting ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Versturen…
                  </>
                ) : 'Verstuur Aanvraag'}
              </button>
            </form>
          </div>
        ) : (
          <div className="p-20 text-center space-y-8 animate-in zoom-in duration-500">
            <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg>
            </div>
            <div>
              <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Aanvraag Verzonden!</h2>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mt-4 leading-relaxed">
                Bedankt {formData.name.split(' ')[0]}. Je aanvraag en plattegrond zijn<br/>
                doorgestuurd. Je ontvangt een bevestiging per e-mail.
              </p>
            </div>
            <button
              onClick={handleClose}
              className="px-12 py-4 bg-slate-900 text-white font-black rounded-2xl uppercase tracking-widest shadow-xl hover:bg-black transition-all"
            >
              Terug naar overzicht
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuoteRequestModal;
