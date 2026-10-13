// src/hooks/useListingView.ts
// État de vue d'une liste (étendu / condensé), persisté par périmètre.
// Tuple (et non objet) pour se lire comme `useState`.
import { useCallback, useState } from 'react';
import { loadListingView, saveListingView, type ListingView } from '../lib/listingView';

export function useListingView(scope: string): [ListingView, (v: ListingView) => void] {
  const [view, setViewState] = useState<ListingView>(() => loadListingView(scope));
  const setView = useCallback(
    (v: ListingView) => {
      setViewState(v);
      saveListingView(scope, v);
    },
    [scope]
  );
  return [view, setView];
}

export default useListingView;
