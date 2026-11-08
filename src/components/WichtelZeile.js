import './WichtelZeile.css';
import DeleteRowButton from './DeleteRowButton';
import TrashIcon from './icons/TrashIcon';
import useSwipeToDelete from '../hooks/useSwipeToDelete';
import { isBase64Image } from '../utils/imageUtils';

/**
 * Listenzeile der Wichtel-Seiten mit dem einheitlichen Löschen (CLAUDE.md):
 * Desktop DeleteRowButton am rechten Rand, mobil Linksswipe. Das Löschen selbst
 * (sofort ausblenden, Snackbar „Rückgängig“) steuert der Aufrufer über
 * useUndoableDelete.
 *
 * @param {Object} props
 * @param {string} [props.itemName] - für Tooltip/aria-label „<Name> entfernen“
 * @param {string} [props.entfernenLabel] - ganzer Text statt „<Name> entfernen“ (übersetzte Seiten)
 * @param {Function} [props.onDelete] - ohne: Zeile ohne Löschen
 * @param {string} [props.swipeIcon] - konfiguriertes Swipe-Icon (Text oder Bild)
 * @param {string} [props.className]
 */
function WichtelZeile({ itemName, entfernenLabel, onDelete, swipeIcon, className = '', children }) {
  const canDelete = typeof onDelete === 'function';
  const { offset, isDeleteVisible, reset, handlers } = useSwipeToDelete({ disabled: !canDelete });
  const label = entfernenLabel || `${itemName} entfernen`;

  return (
    <li
      className={`wichtel-zeile${isDeleteVisible ? ' swipe-delete-active' : ''}${
        isDeleteVisible || offset !== 0 ? ' wichtel-zeile--wischt' : ''}${className ? ` ${className}` : ''}`}
    >
      {canDelete && (
        <div className="swipe-delete-background wichtel-zeile-swipe" aria-hidden={!isDeleteVisible && offset === 0}>
          <button
            type="button"
            className="swipe-delete-action"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
              reset();
            }}
            aria-label={label}
            tabIndex={isDeleteVisible ? 0 : -1}
          >
            {isBase64Image(swipeIcon) ? (
              <img src={swipeIcon} alt="" className="swipe-delete-icon-image" draggable="false" />
            ) : (
              <span className="swipe-delete-icon-text">{swipeIcon || <TrashIcon />}</span>
            )}
          </button>
        </div>
      )}
      <div
        className={`wichtel-zeile-inhalt${canDelete ? ' delete-row-hover-target' : ''}`}
        style={offset ? { transform: `translateX(${offset}px)` } : undefined}
        onClickCapture={(e) => {
          // Offene Swipe-Aktion: ein Tipp auf die Zeile schließt sie nur – auch auf
          // einem Link darin (Link-Vorschau), der sonst die Seite öffnen würde.
          if (isDeleteVisible) {
            e.preventDefault();
            e.stopPropagation();
            reset();
          }
        }}
        {...(canDelete ? handlers : {})}
      >
        <div className="wichtel-zeile-text">{children}</div>
        {canDelete && (
          <DeleteRowButton
            className="wichtel-zeile-loeschen"
            itemName={itemName}
            label={label}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          />
        )}
      </div>
    </li>
  );
}

export default WichtelZeile;
