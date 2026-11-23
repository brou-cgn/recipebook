import React from 'react';
import './MemberProfilePage.css';
import { useFollow } from '../contexts/FollowContext';
import useUndoableDelete from '../hooks/useUndoableDelete';
import UndoSnackbar from './UndoSnackbar';
import { stopFollowing, ANONYMOUS_NAME } from '../utils/followFirestore';
import { useRezeptTitel, useTexte } from '../contexts/SpracheContext';
import netzwerkTexte from '../i18n/texte/netzwerk';
import allgemeinTexte from '../i18n/texte/allgemein';

// Schlüssel in src/i18n/texte/netzwerk.js (Mehrsprachigkeit PR 6s)
const STATUS_TEXT = {
  pending: 'statusAngefragt',
  accepted: 'statusFolgst',
};

const WITHDRAW_LABEL = { pending: 'anfrageZurueckziehen', accepted: 'nichtMehrFolgen' };

/**
 * Profil eines Mitglieds (Vorhaben Follow, PR 4b): Status der Beziehung und die
 * Rezepte, die die Person angelegt hat und die der Nutzer sehen darf.
 * @param {Object} props
 * @param {string} props.userId
 * @param {string} props.name
 * @param {Array} props.recipes - bereits sichtbarkeitsgefilterte Rezepte
 */
function MemberProfilePage({ userId, name, recipes = [], onBack, onSelectRecipe }) {
  const { enabled, userId: me, statusOf, request } = useFollow();
  const { banners, pendingKeys, scheduleDelete, undoDelete } = useUndoableDelete();
  const isSelf = userId === me;
  const removing = pendingKeys.has(`follow:${userId}`);
  const status = removing ? null : statusOf(userId);
  const lastBanner = banners[banners.length - 1];
  const ownRecipes = recipes.filter((r) => r.authorId === userId);
  const t = useTexte(netzwerkTexte);
  const tAllgemein = useTexte(allgemeinTexte);
  const zeigeTitel = useRezeptTitel();
  // Ohne Profil heißt eine Person „Ein Mitglied“ (ANONYMOUS_NAME); angezeigt in der geltenden Sprache
  const anzeigeName = name === ANONYMOUS_NAME ? t('einMitglied') : name;

  // Zurückziehen/Beenden wirkt sofort in der Ansicht, gelöscht wird nach dem Undo-Fenster.
  const withdraw = () => scheduleDelete({
    key: `follow:${userId}`,
    message: anzeigeName,
    onConfirm: () => {
      Promise.resolve().then(() => stopFollowing(me, userId))
        .catch((err) => console.error('Follow beenden fehlgeschlagen:', err));
    },
    onUndo: () => {},
  });

  return (
    <div className="member-profile">
      <div className="member-profile-header">
        <button type="button" className="member-profile-back" onClick={onBack} aria-label={tAllgemein('zurueck')}>&larr;</button>
        <h2>{anzeigeName}</h2>
      </div>

      {enabled && !isSelf && (
        <section className="member-profile-status" aria-label={t('folgen')}>
          {status ? (
            <>
              <p>{t(STATUS_TEXT[status])}</p>
              <button type="button" className="member-profile-btn" onClick={withdraw}>
                {t(WITHDRAW_LABEL[status])}
              </button>
            </>
          ) : (
            <>
              <p>{t('folgstNicht')}</p>
              <button type="button" className="member-profile-btn member-profile-btn--primary"
                onClick={() => request(userId, anzeigeName)}>
                {t('folgen')}
              </button>
            </>
          )}
        </section>
      )}

      <h3 className="member-profile-subtitle">{t('rezepte')}</h3>
      {ownRecipes.length === 0 ? (
        <p className="member-profile-empty">{t('keineRezepte')}</p>
      ) : (
        <ul className="member-profile-recipes">
          {ownRecipes.map((recipe) => (
            <li key={recipe.id}>
              <button type="button" className="member-profile-recipe" onClick={() => onSelectRecipe(recipe)}>
                {zeigeTitel(recipe)}
              </button>
            </li>
          ))}
        </ul>
      )}

      <UndoSnackbar
        itemName={lastBanner?.message}
        onUndo={() => lastBanner && undoDelete(lastBanner.id)}
      />
    </div>
  );
}

export default MemberProfilePage;
