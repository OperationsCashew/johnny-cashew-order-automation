import React, { useState } from 'react';
import { supabase } from '../../services/supabaseClient';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || 'Google login mislukt');
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isRegister) {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Er is een fout opgetreden');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="p-8 pb-4 flex justify-between items-center">
          <h2 className="text-2xl font-black uppercase tracking-tighter">
            {isRegister ? 'Account Aanmaken' : 'Inloggen'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 transition-colors p-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 pt-4 space-y-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-relaxed">
            {isRegister ? 'Maak een account om je renovatieprojecten op te slaan.' : 'Log in om verder te gaan met je opgeslagen werk.'}
          </p>

          {/* Google login */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3.5 bg-white border border-gray-200 rounded-2xl font-black text-[11px] text-gray-700 uppercase tracking-widest shadow-sm hover:bg-gray-50 hover:border-gray-300 transition-all active:scale-95 disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Doorgaan met Google
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">of</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          {error && (
            <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl text-xs font-bold text-rose-600 animate-in slide-in-from-top-2">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="auth-email" className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">E-mailadres</label>
            <input 
              id="auth-email"
              name="email"
              autoComplete="username"
              required
              type="email" 
              className="w-full bg-gray-50 border border-gray-200 p-4 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-100 transition-all font-bold text-gray-900"
              placeholder="je@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="auth-password" className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Wachtwoord</label>
            <input 
              id="auth-password"
              name="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              required
              type="password" 
              className="w-full bg-gray-50 border border-gray-200 p-4 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-100 transition-all font-bold text-gray-900"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-4 bg-emerald-600 text-white font-black rounded-2xl uppercase tracking-widest shadow-lg hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50 mt-4"
          >
            {loading ? 'Bezig...' : (isRegister ? 'Registreren' : 'Inloggen')}
          </button>

          <div className="text-center mt-6">
            <button 
              type="button"
              onClick={() => setIsRegister(!isRegister)}
              className="text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-emerald-600 transition-colors"
            >
              {isRegister ? 'Heb je al een account? Log in' : 'Nog geen account? Registreer hier'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AuthModal;