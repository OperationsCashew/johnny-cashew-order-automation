import { useEffect, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

const TOUR_KEY = 'verbouwscan_tour_seen';

export function useTour(floorsLoaded: boolean, isLoggedIn: boolean) {
  const started = useRef(false);

  useEffect(() => {
    if (!floorsLoaded) return;
    if (isLoggedIn) return;
    if (localStorage.getItem(TOUR_KEY)) return;
    if (started.current) return;

    started.current = true;

    const timer = setTimeout(() => {
      const driverObj = driver({
        showProgress: true,
        progressText: '{{current}} / {{total}}',
        nextBtnText: 'Volgende →',
        prevBtnText: '← Terug',
        doneBtnText: 'Klaar ✓',
        allowClose: true,
        overlayColor: '#0f172a',
        overlayOpacity: 0.45,
        popoverClass: 'verbouwscan-tour',
        onDestroyed: () => {
          localStorage.setItem(TOUR_KEY, '1');
        },
        steps: [
          {
            element: '#tour-floorplan',
            popover: {
              title: '👋 Welkom bij VerbouwScan!',
              description:
                'Je woning is ingeladen als interactieve plattegrond. <strong>Klik op een kamer</strong> om de renovatie-opties te zien en kosten te berekenen.',
              side: 'right',
              align: 'center',
            },
          },
          {
            element: '#tour-viewmode',
            popover: {
              title: '🔄 3D of lijst',
              description:
                'Wissel tussen de <strong>interactieve plattegrond</strong> en een overzichtelijke <strong>lijstweergave</strong> van alle kamers en werkzaamheden.',
              side: 'bottom',
              align: 'center',
            },
          },
          {
            element: '#tour-sidebar',
            popover: {
              title: '🏠 Renovatie per kamer',
              description:
                'Hier stel je per kamer in wat er verbouwd moet worden: schilderen, vloer, sanitair en meer. Kosten worden direct doorgerekend.',
              side: 'left',
              align: 'start',
            },
          },
          {
            element: '#tour-cost-badge',
            popover: {
              title: '💶 Live kostenindicatie',
              description:
                'Elke aanpassing werkt direct door in deze raming. De bandbreedte geeft een realistische onder- en bovengrens van de verbouwkosten.',
              side: 'bottom',
              align: 'center',
            },
          },
          {
            element: '#tour-settings',
            popover: {
              title: '⚙️ Kosten aanpassen',
              description:
                'Pas de kostenprijzen aan op je eigen situatie en sla ze op voor toekomstige projecten. Log in om je instellingen te bewaren.',
              side: 'bottom',
              align: 'start',
            },
          },
          {
            element: '#tour-photo-btn',
            popover: {
              title: '📸 AI Foto-analyse',
              description:
                'VerbouwScan analyseert Funda-foto\'s automatisch via Gemini Vision. Je kunt ook <strong>eigen foto\'s uploaden</strong> voor een nauwkeurigere analyse.',
              side: 'bottom',
              align: 'start',
            },
          },
          {
            element: '#tour-fml-btn',
            popover: {
              title: '📐 Plattegrond exporteren',
              description:
                'Download de plattegrond als FML-bestand en importeer hem direct in <strong>Floorplanner</strong> om je verbouwing te visualiseren en in te richten.',
              side: 'bottom',
              align: 'start',
            },
          },
          {
            element: '#tour-pdf-btn',
            popover: {
              title: '📄 PDF Rapport',
              description:
                'Download een volledig kostenoverzicht per kamer als professioneel PDF-rapport — handig voor je aannemer of makelaar.',
              side: 'bottom',
              align: 'end',
            },
          },
          {
            element: '#tour-quote-btn',
            popover: {
              title: '🏗️ Vraag offerte aan',
              description:
                'VerbouwScan benadert minimaal drie aannemers voor een offerte op basis van jouw werkzaamheden. Je werkzaamheden worden gedeeld — <strong>niet de kosten</strong>.',
              side: 'left',
              align: 'end',
            },
          },
          {
            element: '#tour-help-btn',
            popover: {
              title: '❓ Help & Info',
              description:
                'Vragen over de werking of de kostenberekening? Hier vind je de FAQ, contactgegevens en de algemene voorwaarden.',
              side: 'top',
              align: 'start',
            },
          },
        ],
      });

      driverObj.drive();
    }, 900);

    return () => {
      clearTimeout(timer);
      // Reset zodat React StrictMode's tweede run de timer alsnog kan starten
      started.current = false;
    };
  }, [floorsLoaded, isLoggedIn]);
}
