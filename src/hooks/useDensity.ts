// src/hooks/useDensity.ts
// Wrapper useState + persistance. Renvoie un TUPLE (et non un objet) pour
// se lire exactement comme `useState` chez les consommateurs :
// `const [density, setDensity] = useDensity()`.
import { useCallback, useState } from 'react';
import { loadDensity, saveDensity, type Density } from '../lib/density';

export function useDensity(): [Density, (d: Density) => void] {
  // Initialiseur paresseux : `loadDensity` touche localStorage, inutile de
  // le rejouer à chaque render.
  const [density, setDensityState] = useState<Density>(() => loadDensity());

  // useCallback avec deps vides : le setter est stable, il peut donc être
  // passé en prop sans invalider les mémos des enfants.
  const setDensity = useCallback((d: Density) => {
    setDensityState(d);
    saveDensity(d);
  }, []);

  return [density, setDensity];
}

export default useDensity;
