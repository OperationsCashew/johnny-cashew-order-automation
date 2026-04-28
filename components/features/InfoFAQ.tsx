
import React from 'react';

const SectionHeader = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <div className="border-b border-slate-100 pb-8">
    <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-2">{title}</h3>
    <p className="text-xs font-black text-emerald-600 uppercase tracking-widest">{subtitle}</p>
  </div>
);

const CategoryLabel = ({ label }: { label: string }) => (
  <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] pt-2">{label}</p>
);

const FaqItem = ({ number, question, children }: { number: string; question: string; children: React.ReactNode }) => (
  <div className="p-6 bg-slate-50/50 rounded-3xl border border-slate-100 hover:bg-white hover:border-emerald-100 transition-all group">
    <h4 className="text-xs font-black text-slate-900 uppercase tracking-tight mb-2 group-hover:text-emerald-600 transition-colors flex items-start gap-2">
      <span className="text-[9px] font-black text-slate-300 mt-0.5 shrink-0">{number}.</span>
      {question}
    </h4>
    <div className="text-[11px] font-bold text-slate-500 leading-relaxed tracking-wide space-y-1.5">
      {children}
    </div>
  </div>
);

const Bullet = ({ children }: { children: React.ReactNode }) => (
  <li className="text-[11px] font-bold text-slate-500 leading-relaxed">{children}</li>
);

const InfoFAQ: React.FC = () => {
  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-4">
      <SectionHeader title="Veelgestelde Vragen" subtitle="Alles wat u moet weten over VerbouwScan" />

      <CategoryLabel label="Algemeen" />

      <FaqItem number="1" question="Wat is VerbouwScan precies?">
        <p>
          VerbouwScan is een slimme tool die met behulp van kunstmatige intelligentie (AI) een snelle indicatie geeft van
          renovatiekosten. De app analyseert data, afbeeldingen en plattegronden om per ruimte een raming te genereren.
          Dit helpt u om in de oriëntatiefase (bijvoorbeeld bij de aankoop van een woning) snel een beeld te krijgen
          van het benodigde budget.
        </p>
      </FaqItem>

      <FaqItem number="2" question="Hoe komt de AI tot deze suggesties?">
        <p>
          De AI analyseert de beschikbare visuele data en omschrijvingen van een woning. Hij herkent zaken als gedateerd
          materiaal, de staat van muren en vloeren, en de stijl van de keuken of badkamer.
        </p>
        <p className="text-emerald-700 font-black text-[10px] uppercase tracking-wide">
          Belangrijk: De AI doet alleen suggesties. U bent zelf degene die de definitieve keuzes maakt en acties in- of uitschakelt.
        </p>
      </FaqItem>

      <CategoryLabel label="Eigen Data & Foto's" />

      <FaqItem number="3" question="Kan ik mijn eigen foto's toevoegen voor analyse?">
        <p>
          Ja, absoluut. Naast de automatisch ingeladen afbeeldingen kunt u ook zelf foto's uploaden. De AI zal deze
          nieuwe beelden analyseren om de raming nog nauwkeuriger te maken of om ruimtes te beoordelen die eerder
          niet goed zichtbaar waren.
        </p>
      </FaqItem>

      <FaqItem number="4" question="Kan ik zelf een plattegrond uploaden?">
        <p>
          Ja. Als er geen digitale plattegrond beschikbaar is, of als u een eigen bestand heeft, kunt u dit uploaden.
          VerbouwScan gebruikt deze data om de oppervlaktes (m²) van wanden, vloeren en plafonds te berekenen.
        </p>
      </FaqItem>

      <CategoryLabel label="Nauwkeurigheid & Controle" />

      <FaqItem number="5" question="Waarom moet ik de plattegrond altijd controleren?">
        <p>De berekening van VerbouwScan is zo nauwkeurig als de plattegrond die wordt ingevoerd. Fouten in de brondata hebben een grote impact:</p>
        <ul className="list-disc pl-4 space-y-1 mt-1">
          <Bullet><strong>Ramen en deuren:</strong> Als een raam of deur niet (of verkeerd) op de plattegrond staat, klopt de berekening voor stuc- en schilderwerk niet meer. Ook de kosten voor het vervangen van kozijnen wijken dan af.</Bullet>
          <Bullet><strong>Oppervlaktes:</strong> Controleer altijd of de maten logisch overkomen. Een foutieve schaal in een plattegrond zorgt voor een onjuiste raming.</Bullet>
        </ul>
      </FaqItem>

      <FaqItem number="6" question="Is dit een definitieve offerte?">
        <p>
          Nee. VerbouwScan geeft een indicatieve raming. Het is een hulpmiddel om een orde van grootte te bepalen.
          Vanwege marktfluctuaties en onzichtbare gebreken adviseren wij altijd om de uitkomsten te laten controleren
          door een professionele aannemer of bouwkundig adviseur voordat u financiële verplichtingen aangaat.
        </p>
      </FaqItem>

      <CategoryLabel label="Scope & Kosten" />

      <FaqItem number="7" question="Welke kosten worden niet meegenomen?">
        <p>VerbouwScan focust op veelvoorkomende interieur-renovaties. De volgende zaken zijn momenteel niet opgenomen:</p>
        <ul className="list-disc pl-4 space-y-1 mt-1">
          <Bullet><strong>Exterieur:</strong> Dakwerk, gevelreiniging en schilderwerk buiten.</Bullet>
          <Bullet><strong>Installaties:</strong> Volledige vernieuwing van elektra, leidingwerk of de CV-installatie.</Bullet>
          <Bullet><strong>Isolatie:</strong> Het isoleren van muren, vloeren of daken.</Bullet>
          <Bullet><strong>Constructie:</strong> Funderingsherstel of het verwijderen van dragende muren (tenzij specifiek aangegeven).</Bullet>
        </ul>
      </FaqItem>

      <FaqItem number="8" question="Kan ik de eenheidsprijzen aanpassen?">
        <p>
          Ja. Via de instellingen kunt u alle prijzen (zoals de prijs per m² voor stucwerk of de kosten van een
          basiskeuken) aanpassen naar de tarieven van uw eigen aannemer of de huidige marktprijzen in uw regio.
        </p>
      </FaqItem>

      <CategoryLabel label="AI Werkzaamheden" />

      <FaqItem number="9" question="Hoe werkt de AI kostenraming?">
        <p>
          De AI gebruikt de afmetingen van de ruimte — vloeroppervlak, wandoppervlak, plafond, omtrek en hoogte —
          in combinatie met een realistische uurprijs per vakdiscipline om een schatting te maken.
          De berekening houdt altijd rekening met zowel arbeid als materiaal.
        </p>
      </FaqItem>

      <FaqItem number="10" question="Waarom levert meer detail een betere schatting op?">
        <p>
          Hoe specifieker de omschrijving, hoe beter de AI de juiste prijs kan inschatten.
          Materiaalsoort, gewenste kwaliteit en merk maken een groot verschil.
        </p>
        <p className="text-emerald-700 font-black text-[10px] uppercase tracking-wide">
          Bijv: "dakkapel plaatsen" geeft een andere uitkomst dan "dakkapel 2m breed, KOMO-gecertificeerd, houten kozijn".
        </p>
      </FaqItem>

      <FaqItem number="11" question="Welke werkzaamheden kan ik invoeren?">
        <p>
          Alles wat niet standaard in de renovatielijst staat. Denk aan:
        </p>
        <ul className="list-disc pl-4 space-y-1 mt-1">
          <Bullet><strong>Luxe toevoegingen:</strong> inbouwsauna, open haard, jacuzzi, wijnkoelkast.</Bullet>
          <Bullet><strong>Exterieur & constructie:</strong> gevelisolatie, dakkapel, aanbouw, schoorsteen herstellen.</Bullet>
          <Bullet><strong>Installaties & comfort:</strong> domotica, zonnepanelen, laadpaal, alarminstallatie.</Bullet>
          <Bullet><strong>Overig:</strong> trap renoveren, tuinhuisje, garage ombouwen, zolderverbouwing.</Bullet>
        </ul>
      </FaqItem>

      <CategoryLabel label="Privacy" />

      <FaqItem number="12" question="Wat gebeurt er met mijn geüploade bestanden?">
        <p>
          Uw foto's en plattegronden worden veilig opgeslagen in uw eigen projectomgeving. Deze gegevens worden alleen
          gedeeld met derden (bijvoorbeeld een aannemer voor een offerte) als u daar zelf expliciet opdracht toe geeft
          binnen de app.
        </p>
      </FaqItem>

      <FaqItem number="13" question="Kan ik het rapport gebruiken voor mijn hypotheek?">
        <p>
          Hoewel het rapport een zeer gedetailleerd overzicht geeft, is het geen officieel taxatierapport of een
          bouwkundige keuring. Geldverstrekkers eisen vaak rapporten van gecertificeerde inspecteurs. Gebruik VerbouwScan
          om uw eigen plan te trekken en als basis voor gesprekken met professionals.
        </p>
      </FaqItem>

      <CategoryLabel label="Onafhankelijkheid & Partnerschappen" />

      <FaqItem number="14" question="Is VerbouwScan onderdeel van Funda of Floorplanner?">
        <p>
          Nee. VerbouwScan is een volledig onafhankelijk platform. Wij zijn op geen enkele wijze gelieerd aan, verbonden
          met, of onderdeel van Funda, Floorplanner, Jaap.nl, Pararius of enige andere vastgoedwebsite of
          branchevereniging.
        </p>
      </FaqItem>
    </div>
  );
};

export default InfoFAQ;
