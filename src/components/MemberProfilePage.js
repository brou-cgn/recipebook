import React from 'react';
import './MemberProfilePage.css';
import { useFollow } from '../contexts/FollowContext';
import useUndoableDelete from '../hooks/useUndoableDelete';
import UndoSnackbar from './UndoSnackbar';
import { stopFollowing } from '../utils/followFirestore';

const STATUS_TEXT = {
  pending: 'Angefragt. Du siehst die Aktivität, sobald die Person zustimmt.',
  accepted: 'Du folgst dieser Person.',
};

const WITHDRAW_LABEL = { pending: 'Anfrage zurückziehen', accepted: 'Nicht mehr folgen' };

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

  // Zurückziehen/Beenden wirkt sofort in der Ansicht, gelöscht wird nach dem Undo-Fenster.
  const withdraw = () => scheduleDelete({
    key: `follow:${userId}`,
    message: name,
    onConfirm: () => {
      Promise.resolve().then(() => stopFollowing(me, userId))
        .catch((err) => console.error('Follow beenden fehlgeschlagen:', err));
    },
    onUndo: () => {},
  });

  return (
    <div className="member-profile">
      <div className="member-profile-header">
        <button type="button" className="member-profile-back" onClick={onBack} aria-label="Zurück">&larr;</button>
        <h2>{name}</h2>
      </div>

      {enabled && !isSelf && (
        <section className="member-profile-status" aria-label="Folgen">
          {status ? (
            <>
              <p>{STATUS_TEXT[status]}</p>
              <button type="button" className="member-profile-btn" onClick={withdraw}>
                {WITHDRAW_LABEL[status]}
              </button>
            </>
          ) : (
            <>
              <p>Du folgst dieser Person nicht.</p>
              <button type="button" className="member-profile-btn member-profile-btn--primary"
                onClick={() => request(userId, name)}>
                Folgen
              </button>
            </>
          )}
        </section>
      )}

      <h3 className="member-profile-subtitle">Rezepte</h3>
      {ownRecipes.length === 0 ? (
        <p className="member-profile-empty">Keine Rezepte, die du sehen kannst.</p>
      ) : (
        <ul className="member-profile-recipes">
          {ownRecipes.map((recipe) => (
            <li key={recipe.id}>
              <button type="button" className="member-profile-recipe" onClick={() => onSelectRecipe(recipe)}>
                {recipe.title}
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
