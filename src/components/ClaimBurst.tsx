// src/components/ClaimBurst.tsx
// Éclat de particules joué une seule fois, au moment où une quête est
// réclamée. Monté conditionnellement par QuestBoard (`justClaimed === key`)
// puis démonté après 700 ms — il n'y a donc aucune logique de reset ici :
// le cycle de vie du composant EST le déclencheur de l'animation.
//
// Le parent doit être `relative` (et de préférence `overflow-visible`,
// sinon les particules sont rognées au bord de la ligne).
const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

export function ClaimBurst() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-visible">
      {ANGLES.map((deg, i) => (
        <span
          key={deg}
          className="quest-burst-particle absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full"
          style={{
            // Les 3 accents en rotation. `rgb(var(--…-rgb))` et non une classe
            // Tailwind : la couleur varie par index, donc elle ne peut pas être
            // statique — et une classe construite dynamiquement serait purgée.
            background: ['rgb(var(--accent-gold-rgb))', 'rgb(var(--accent-neon-rgb))', 'rgb(var(--accent-violet-rgb))'][i % 3],
            // Lu par @keyframes quest-burst pour projeter chaque particule dans
            // sa direction. Sans la règle CSS correspondante, tout reste empilé
            // au centre — invisible, et sans la moindre erreur.
            ['--burst-angle' as string]: `${deg}deg`,
            animationDelay: `${i * 15}ms`,
          }}
        />
      ))}
    </span>
  );
}

export default ClaimBurst;
