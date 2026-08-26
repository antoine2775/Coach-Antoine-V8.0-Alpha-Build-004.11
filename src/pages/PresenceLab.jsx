import React from "react";
import CoachArmGesture from "../components/CoachArmGesture";

export default function PresenceLab() {
  return (
    <>
      <header className="page-header">
        <p className="eyebrow">V8 — BUILD 004.10</p>
        <h1>La main et les lunettes</h1>
        <p>
          Le visage reste fixe. Les lunettes glissent d'abord sur le front. La main ne bouge qu'ensuite, puis les remonte presque sans y penser.
        </p>
      </header>

      <section className="presence-lab">
        <div className="card arm-focus-card">
          <CoachArmGesture size={345} autoTest showButton />

          <div className="arm-test-rules">
            <p>
              <strong>À observer :</strong> les lunettes descendent d'abord. Elles restent un court instant plus bas. Ensuite seulement la main monte, les remet en place, puis redescend.
            </p>
            <p>
              Sur cette page de test, la séquence revient toutes les 7 secondes.
            </p>
          </div>
        </div>

        <div className="card">
          <h2>Une seule chose nouvelle</h2>
          <p>
            Le mouvement du bras de Build 004.8 est conservé. Nous ajoutons seulement
            le déplacement indépendant des lunettes. Aucun mouvement du visage ou de la tête.
          </p>
        </div>
      </section>
    </>
  );
}
