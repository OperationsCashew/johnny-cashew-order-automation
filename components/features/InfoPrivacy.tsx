
import React from 'react';

const SectionHeader = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <div className="border-b border-slate-100 pb-8">
    <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-2">{title}</h3>
    <p className="text-xs font-black text-emerald-600 uppercase tracking-widest">{subtitle}</p>
  </div>
);

const Article = ({ number, title, children }: { number: string; title: string; children: React.ReactNode }) => (
  <div className="space-y-3">
    <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
      <span className="bg-slate-900 text-white text-[9px] font-black px-2 py-0.5 rounded-md">{number}</span>
      {title}
    </h4>
    <div className="space-y-2 pl-1">{children}</div>
  </div>
);

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[11px] font-semibold text-slate-500 leading-relaxed">{children}</p>
);

const Bullet = ({ children }: { children: React.ReactNode }) => (
  <li className="text-[11px] font-semibold text-slate-500 leading-relaxed">{children}</li>
);

const InfoPrivacy: React.FC = () => {
  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-8">
      <SectionHeader title="Privacy Policy" subtitle="Laatste update: 4 maart 2026" />

      <P>
        VerbouwScan hecht grote waarde aan de bescherming van uw persoonsgegevens. In deze Privacy Policy leggen wij uit
        welke gegevens wij verzamelen, hoe wij deze gebruiken en wat uw rechten zijn.
      </P>

      <Article number="1" title="Welke gegevens verzamelen wij?">
        <P>Wij verwerken gegevens die noodzakelijk zijn voor het functioneren van onze AI-gedreven renovatietool:</P>
        <ul className="list-disc pl-5 space-y-1.5 mt-1">
          <Bullet><strong>Accountgegevens:</strong> E-mailadres en wachtwoord (beveiligd via Supabase Authentication).</Bullet>
          <Bullet><strong>Projectgegevens:</strong> Adressen, foto's van de woning (door u geüpload of via publieke bronnen), en door u verstrekte plattegronden.</Bullet>
          <Bullet><strong>Analysegegevens:</strong> De door de AI gegenereerde renovatie-acties, kostenramingen en door u gemaakte aanpassingen in de instellingen.</Bullet>
          <Bullet><strong>Gebruiksgegevens:</strong> Informatie over hoe u het Platform gebruikt, zoals browsertype en interactie met de 3D-plattegrond, om de gebruikerservaring te verbeteren.</Bullet>
        </ul>
      </Article>

      <Article number="2" title="Doeleinden van de gegevensverwerking">
        <P>Wij gebruiken uw gegevens uitsluitend voor de volgende doeleinden:</P>
        <ul className="list-disc pl-5 space-y-1.5 mt-1">
          <Bullet><strong>Het leveren van de Dienst:</strong> Het genereren van kostenramingen op basis van de door u verstrekte of opgevraagde data.</Bullet>
          <Bullet><strong>AI-Optimalisatie:</strong> Het verbeteren van onze algoritmen (geanonimiseerd), zodat de AI steeds nauwkeuriger renovatiebehoeften kan herkennen.</Bullet>
          <Bullet><strong>Cloud-opslag:</strong> Het opslaan van uw projecten zodat u deze op een later moment kunt inzien of wijzigen.</Bullet>
          <Bullet><strong>Communicatie:</strong> Het verzenden van technische updates of informatie over uw account.</Bullet>
        </ul>
      </Article>

      <Article number="3" title="Gegevensdeling met derden">
        <P>Uw privacy is ons uitgangspunt. Wij delen uw gegevens nooit zomaar met derden, behalve in de volgende gevallen:</P>
        <ul className="list-disc pl-5 space-y-1.5 mt-1">
          <Bullet><strong>Expliciet verzoek (Offertes):</strong> Wanneer u binnen het Platform gebruikmaakt van de functie om een offerte op te vragen, delen wij de relevante projectgegevens (zoals het renovatierapport en foto's) uitsluitend met de door u geselecteerde partijen.</Bullet>
          <Bullet><strong>Dienstverleners (Verwerkers):</strong> Wij maken gebruik van vertrouwde partners zoals Supabase (database en hosting) en OpenAI/Google Gemini (AI-verwerking). Met deze partijen zijn verwerkersovereenkomsten gesloten om uw data te beveiligen.</Bullet>
          <Bullet><strong>Wettelijke verplichting:</strong> Indien wij wettelijk verplicht zijn om gegevens te delen met overheidsinstanties.</Bullet>
        </ul>
      </Article>

      <Article number="4" title="Foto- en Beeldmateriaal">
        <ul className="list-disc pl-5 space-y-1.5">
          <Bullet><strong>Eigen uploads:</strong> Wanneer u zelf foto's uploadt, worden deze door onze AI geanalyseerd om de staat van de woning te bepalen. Deze foto's blijven uw eigendom en worden niet voor commerciële doeleinden van derden gebruikt.</Bullet>
          <Bullet><strong>Publieke data:</strong> Indien de tool foto's ophaalt van publieke bronnen, gebeurt dit uitsluitend ten behoeve van de raming voor uw specifieke project.</Bullet>
        </ul>
      </Article>

      <Article number="5" title="Beveiliging van gegevens">
        <P>Wij nemen passende technische en organisatorische maatregelen om uw gegevens te beschermen tegen verlies of onrechtmatige verwerking:</P>
        <ul className="list-disc pl-5 space-y-1.5 mt-1">
          <Bullet>Alle dataverbindingen zijn versleuteld (SSL/TLS).</Bullet>
          <Bullet>Wachtwoorden worden versleuteld opgeslagen via de beveiligingsarchitectuur van Supabase.</Bullet>
          <Bullet>API-sleutels voor AI-analyse worden nooit in de browser opgeslagen, maar veilig beheerd via server-side Edge Functions.</Bullet>
        </ul>
      </Article>

      <Article number="6" title="Bewaartermijn">
        <P>Wij bewaren uw gegevens niet langer dan strikt noodzakelijk:</P>
        <ul className="list-disc pl-5 space-y-1.5 mt-1">
          <Bullet>Projecten en accountgegevens blijven bewaard zolang uw account actief is.</Bullet>
          <Bullet>U kunt op elk moment uw projecten of uw gehele account verwijderen, waarna alle gekoppelde persoonsgegevens onmiddellijk uit onze actieve database worden gewist.</Bullet>
        </ul>
      </Article>

      <Article number="7" title="Uw rechten (AVG)">
        <P>Op basis van de AVG heeft u de volgende rechten met betrekking tot uw persoonsgegevens:</P>
        <ul className="list-disc pl-5 space-y-1.5 mt-1">
          <Bullet><strong>Recht op inzage:</strong> U kunt opvragen welke gegevens wij van u verwerken.</Bullet>
          <Bullet><strong>Recht op rectificatie:</strong> U kunt onjuiste gegevens laten corrigeren.</Bullet>
          <Bullet><strong>Recht op vergetelheid:</strong> U kunt ons verzoeken uw gegevens te verwijderen.</Bullet>
          <Bullet><strong>Recht op dataportabiliteit:</strong> U kunt verzoeken om uw gegevens in een gangbaar formaat te ontvangen om deze over te dragen naar een andere partij.</Bullet>
          <Bullet><strong>Recht van bezwaar:</strong> U kunt bezwaar maken tegen de verwerking van uw gegevens voor optimalisatiedoeleinden.</Bullet>
        </ul>
      </Article>

      <Article number="8" title="Cookies">
        <P>
          VerbouwScan maakt gebruik van functionele cookies om u ingelogd te houden en analytische cookies om het gebruik
          van het Platform te meten. Wij gebruiken geen tracking cookies voor advertentiedoeleinden van derden.
        </P>
      </Article>

      <Article number="9" title="Wijzigingen">
        <P>
          Wij behouden ons het recht voor om deze Privacy Policy te wijzigen. Wijzigingen zullen via het Platform
          bekend worden gemaakt.
        </P>
      </Article>

      <Article number="10" title="Contact">
        <P>
          Heeft u vragen over deze Privacy Policy of wilt u gebruikmaken van uw rechten? Neem dan contact met ons op
          via de contactinformatie op de website.
        </P>
      </Article>
    </div>
  );
};

export default InfoPrivacy;
