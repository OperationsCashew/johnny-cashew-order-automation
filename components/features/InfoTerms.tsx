
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

const Sub = ({ id, children }: { id: string; children: React.ReactNode }) => (
  <p className="text-[11px] font-semibold text-slate-500 leading-relaxed">
    <span className="font-black text-slate-700 mr-1">{id}</span>{children}
  </p>
);

const Bullet = ({ children }: { children: React.ReactNode }) => (
  <li className="text-[11px] font-semibold text-slate-500 leading-relaxed">{children}</li>
);

const InfoTerms: React.FC = () => {
  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-8">
      <SectionHeader title="Algemene Voorwaarden" subtitle="Laatste update: 4 maart 2026" />

      <p className="text-[11px] font-semibold text-slate-500 leading-relaxed">
        Welkom bij VerbouwScan. Deze voorwaarden zijn opgesteld om de kaders van onze dienstverlening te verduidelijken
        en de rechtsverhouding tussen VerbouwScan en de Gebruiker vast te leggen. Door het platform te gebruiken,
        verklaart u zich akkoord met de onderstaande bepalingen.
      </p>

      <Article number="1" title="Definities en Toepasselijkheid">
        <Sub id="1.1">
          <strong>VerbouwScan:</strong> De handelsnaam van de digitale dienst die AI-gedreven renovatieramingen faciliteert.
        </Sub>
        <Sub id="1.2">
          <strong>Gebruiker:</strong> De natuurlijke persoon (consument) of professional die gebruikmaakt van het Platform.
        </Sub>
        <Sub id="1.3">
          <strong>Platform:</strong> De software, website en bijbehorende diensten van VerbouwScan.
        </Sub>
        <Sub id="1.4">
          Deze voorwaarden zijn van toepassing op elk gebruik van het Platform en elke tot stand gekomen overeenkomst.
        </Sub>
      </Article>

      <Article number="2" title="Status van het Advies en Eigen Verantwoordelijkheid">
        <Sub id="2.1">
          <strong>AI-Suggesties:</strong> VerbouwScan maakt gebruik van algoritmen en kunstmatige intelligentie om suggesties
          te doen voor renovatie-acties. De Gebruiker begrijpt dat dit nadrukkelijk suggesties zijn en geen dwingende
          adviezen of bindende calculaties.
        </Sub>
        <Sub id="2.2">
          <strong>Keuzevrijheid:</strong> De uiteindelijke keuze om een renovatie-actie op te nemen, aan te passen of te
          negeren ligt volledig bij de Gebruiker. De tool is ontworpen als ondersteuning; de Gebruiker is de finale beslisser.
        </Sub>
        <Sub id="2.3">
          <strong>Professionele Controle:</strong> De Gebruiker is verplicht om de resultaten van VerbouwScan te laten
          controleren door een gekwalificeerde professional (zoals een aannemer, architect of bouwkundig adviseur) voordat
          er financiële verplichtingen, hypotheekaanvragen of fysieke werkzaamheden worden aangegaan.
        </Sub>
      </Article>

      <Article number="3" title="Gebruiksbeperkingen en Commercieel Verbod">
        <Sub id="3.1">
          <strong>Niet-Commercieel Gebruik:</strong> Het Platform is uitsluitend bestemd voor persoonlijk gebruik of
          interne oriëntatie. Het is niet toegestaan om de gegenereerde rapporten commercieel te exploiteren, door te
          verkopen of te gebruiken als officiële taxatie-onderbouwing voor derden.
        </Sub>
        <Sub id="3.2">
          <strong>Intellectueel Eigendom:</strong> Alle rechten van intellectueel eigendom met betrekking tot het Platform,
          waaronder methodieken, algoritmes, de kostenengine en rapportlay-outs, berusten uitsluitend bij VerbouwScan.
        </Sub>
      </Article>

      <Article number="4" title="Beperkte Scope van Werkzaamheden">
        <Sub id="4.1">
          <strong>Interieurfocus:</strong> De Gebruiker is ervan bewust dat VerbouwScan enkel een selectie van veelvoorkomende
          interieur-renovaties meeneemt in de berekeningen.
        </Sub>
        <Sub id="4.2">
          <strong>Ontbrekende Posten:</strong> De raming is nadrukkelijk onvolledig voor een totale woningrenovatie.
          Een groot aantal essentiële posten is momenteel niet opgenomen, waaronder maar niet beperkt tot:
        </Sub>
        <ul className="list-disc pl-5 space-y-1.5 mt-1">
          <Bullet><strong>Exterieur:</strong> Schilderwerk buiten, gevelreiniging, voegwerk en dakwerkzaamheden.</Bullet>
          <Bullet><strong>Isolatie:</strong> Na-isolatie van spouwmuren, vloerisolatie of dakisolatie.</Bullet>
          <Bullet><strong>Installatietechniek:</strong> Volledige vervanging of aanpassing van elektra, groepenkasten, leidingwerk (water/gas/riool) en CV-installaties of warmtepompen.</Bullet>
          <Bullet><strong>Constructief:</strong> Funderingsherstel of complexe constructieve aanpassingen.</Bullet>
        </ul>
      </Article>

      <Article number="5" title="Privacy en Dataoverdracht">
        <Sub id="5.1">
          <strong>Vertrouwelijkheid:</strong> Uw projectgegevens worden beveiligd opgeslagen en niet zonder uw toestemming
          geanalyseerd voor andere doeleinden dan het leveren en verbeteren van de tool.
        </Sub>
        <Sub id="5.2">
          <strong>Delen met Derden:</strong> Gegevens en rapporten worden uitsluitend gedeeld met derden (bijvoorbeeld voor
          het opvragen van offertes bij aannemers) op uw expliciet verzoek en via een actieve handeling binnen het Platform.
        </Sub>
      </Article>

      <Article number="6" title="Bronnen van Onnauwkeurigheid en Vrijwaring">
        <p className="text-[11px] font-semibold text-slate-500 leading-relaxed">
          De Gebruiker aanvaardt dat de raming onnauwkeurigheden kan bevatten door:
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <Bullet><strong>Interpretatiefouten van de AI:</strong> De AI kan visuele data of tekstuele omschrijvingen verkeerd interpreteren.</Bullet>
          <Bullet><strong>Bronbestanden:</strong> Indien geüploade plattegronden of brondata fouten bevatten (zoals incomplete geometrie, ontbrekende muren of verkeerde schaal), resulteert dit in een incorrecte kostenberekening.</Bullet>
          <Bullet><strong>Marktschommelingen:</strong> De gehanteerde eenheidsprijzen zijn gemiddelden en kunnen afwijken van de actuele marktwerking, materiaalschaarste of regionale toeslagen.</Bullet>
        </ul>
      </Article>

      <Article number="7" title="Aansprakelijkheid">
        <Sub id="7.1">
          <strong>Uitsluiting Schade:</strong> VerbouwScan kan nimmer aansprakelijk worden gesteld voor enige schade, direct
          of indirect (waaronder gevolgschade zoals een te hoog bod op een woning), die voortvloeit uit het vertrouwen op
          de door de AI gesuggereerde acties of de daaruit voortvloeiende kostenraming.
        </Sub>
        <Sub id="7.2">
          <strong>Geen Garanties:</strong> VerbouwScan biedt geen garantie op de volledigheid van de raming voor het
          verkrijgen van financiering of bouwvergunningen.
        </Sub>
        <Sub id="7.3">
          <strong>Maximale Aansprakelijkheid:</strong> Voor zover wettelijk toegestaan, is de totale aansprakelijkheid
          van VerbouwScan beperkt tot het bedrag dat de Gebruiker aan VerbouwScan heeft betaald voor de Dienst in de dertig (30)
          dagen voorafgaand aan het schadevoorval.
        </Sub>
      </Article>

      <Article number="8" title="Beschikbaarheid en Overmacht">
        <Sub id="8.1">
          VerbouwScan streeft naar maximale beschikbaarheid, maar garandeert geen ononderbroken toegang tot het Platform.
          In geval van overmacht (storingen bij hostingproviders of internetinfrastructuur) kunnen de verplichtingen van
          VerbouwScan worden opgeschort.
        </Sub>
      </Article>

      <Article number="9" title="Wijzigingen en Toepasselijk Recht">
        <Sub id="9.1">
          VerbouwScan behoudt zich het recht voor deze voorwaarden eenzijdig te wijzigen.
        </Sub>
        <Sub id="9.2">
          Op deze overeenkomst is uitsluitend Nederlands recht van toepassing. Geschillen zullen worden voorgelegd aan
          de bevoegde rechter in het arrondissement waar VerbouwScan is gevestigd.
        </Sub>
      </Article>
    </div>
  );
};

export default InfoTerms;
