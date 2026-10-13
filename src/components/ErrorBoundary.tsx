// src/components/ErrorBoundary.tsx
// ═══════════════════════════════════════════════════════════════════
// Frontière d'erreur globale.
//
// Sans elle, une exception de rendu dans N'IMPORTE quelle page démonte tout
// l'arbre React : écran blanc, plus rien de cliquable, et aucune information
// sur ce qui a échoué. Ici, l'erreur est capturée au niveau de la racine, une
// fiche de secours s'affiche à la place, et le bouton « Retour au jeu » rend
// la main sans avoir à recharger la page.
//
// Contrainte React : seules les classes peuvent être des frontières d'erreur
// (componentDidCatch / getDerivedStateFromError n'existent pas en hook). Le
// composant de classe ne peut donc pas appeler useLanguage() ; les libellés
// lui sont passés en props par le wrapper fonctionnel AppErrorBoundary, qui
// vit sous <LanguageProvider> et suit la langue courante.
// ═══════════════════════════════════════════════════════════════════
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLanguage } from '../lib/i18n/LanguageContext';

export interface ErrorBoundaryLabels {
  title: string;
  message: string;
  backToGame: string;
  details: string;
}

interface Props {
  children: ReactNode;
  labels: ErrorBoundaryLabels;
  /** Route de repli du bouton « Retour au jeu » (hash, ex. '#/'). */
  fallbackHash?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, showDetails: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Trace conservée pour le diagnostic : la fiche de secours ne remplace pas
    // le log de la console, elle évite juste l'écran blanc.
    console.error('[ErrorBoundary] rendu interrompu par une erreur :', error, info.componentStack);
  }

  // Quitte l'état d'erreur ET revient à une route sûre. Changer le hash
  // déclenche le routage ; remettre hasError à false rend l'arbre — si
  // l'erreur venait de la page fautive, la nouvelle route ne la reproduit pas.
  handleBackToGame = (): void => {
    const target = this.props.fallbackHash ?? '#/';
    try {
      if (window.location.hash !== target) window.location.hash = target;
    } catch {
      /* environnement sans window — on se contente de réinitialiser */
    }
    this.setState({ hasError: false, error: null, showDetails: false });
  };

  toggleDetails = (): void => {
    this.setState((s) => ({ showDetails: !s.showDetails }));
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    const { labels } = this.props;
    return (
      <div
        role="alert"
        style={{
          minHeight: '100dvh',
          // Habillage clair du shell premium ; retombe sur l'ivoire si
          // l'attribut data-appearance n'est pas encore posé.
          background: 'var(--p-bg, #f7f6f3)',
          color: 'var(--p-ink, #131318)',
          display: 'grid',
          placeItems: 'center',
          padding: '32px 20px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 44, lineHeight: 1 }} aria-hidden>⚠️</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 16 }}>
            {labels.title}
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--p-ink2, #55555f)', lineHeight: 1.6, marginTop: 10 }}>
            {labels.message}
          </p>

          <button
            type="button"
            onClick={this.handleBackToGame}
            style={{
              marginTop: 22,
              fontSize: 13,
              fontWeight: 700,
              color: '#fff',
              background: 'var(--p-accent, #4c21c4)',
              border: 'none',
              borderRadius: 99,
              padding: '10px 22px',
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {labels.backToGame}
          </button>

          {this.state.error && (
            <div style={{ marginTop: 22 }}>
              <button
                type="button"
                onClick={this.toggleDetails}
                style={{
                  fontSize: 11.5,
                  color: 'var(--p-ink3, #6f6f7a)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                {labels.details}
              </button>
              {this.state.showDetails && (
                <pre
                  style={{
                    marginTop: 10,
                    padding: '10px 12px',
                    background: 'var(--p-panel, #fdfdfc)',
                    border: '1px solid var(--p-line, #e4e2dc)',
                    borderRadius: 10,
                    fontSize: 11,
                    color: 'var(--p-ink2, #55555f)',
                    textAlign: 'left',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: 200,
                    overflow: 'auto',
                  }}
                >
                  {this.state.error.message}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
}

/**
 * Enveloppe i18n de la frontière : lit la langue courante et transmet les
 * libellés. À monter sous <LanguageProvider>.
 */
export default function AppErrorBoundary({
  children,
  fallbackHash,
}: {
  children: ReactNode;
  fallbackHash?: string;
}) {
  const { t } = useLanguage();
  return (
    <ErrorBoundary
      fallbackHash={fallbackHash}
      labels={{
        title: t('errorBoundary.title'),
        message: t('errorBoundary.message'),
        backToGame: t('errorBoundary.backToGame'),
        details: t('errorBoundary.details'),
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
