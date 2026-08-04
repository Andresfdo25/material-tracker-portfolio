// StageMoveButtons.tsx — the three stage buttons (🏭/📍/🔩), in one shared place (ported
// from the private build's lote 64). They started inside the mosaic's per-package window
// and Late deliveries wanted the same thing days later: a truck that shows up three weeks
// late often unloads straight at the jobsite, so a single "it arrived ✅" that only meant
// 🏭 was recording something that hadn't happened. Both windows are the same decision on
// the same item, so it's one component and not two near-identical tables — the label, the
// reason a disabled button gives, and what each scope offers all have to agree.
//
// Rules it inherits from the board (see OverviewClockModals.tsx):
//   · Writes nothing. Calls `onMove(target)` and the screen decides — which asks for the
//     date first, because none of these buttons stamp today.
//   · A button whose write would not land goes disabled with the reason (`moves`, from
//     `stageMoves()` in logic.ts) — never recalculated locally.
//   · 🔩 does not exist on a supply-only package: there 📍 IS the close, and installing
//     is somebody else's job.
import { STAGE_META, type StageMoves } from '../store/logic';
import type { ItemStage } from '../store/types';
import { Button } from './ds/Button';

/** The three stages a button can request. 'pending' is not one of them: un-receiving
 * material is a correction, made from Breakdown Delivery / Install, not a board move. */
export type MoveTarget = Extract<ItemStage, 'warehouse' | 'on-site' | 'installed'>;

/** Why a move is unavailable, said where the PM can do something about it. Never "can't"
 * on its own — always where it can be done instead. */
const WHY: Record<Exclude<StageMoves['stageBlocked'], ''>, string> = {
  log: 'This item follows its delivery log — register the movement in Breakdown Delivery from the Material List.',
  backorder: 'Part of this order is still owed — register the rest by quantity in Breakdown Delivery, or use 🚚 Partially delivered.',
  ofci: 'Owner-furnished material never enters our delivery flow, so its only axis is installed or not.',
};

/** The reason is decided PER BUTTON, not per row: the same item can accept 🔩 and refuse
 * 🏭 (an OFCI item does exactly that). Position first — it already passed that stage —
 * then `stageMoves`'s own arbitration. */
function why(moves: StageMoves, stage: ItemStage, target: MoveTarget): string {
  if (target === 'warehouse') {
    return stage === 'pending' ? WHY[moves.stageBlocked || 'log'] : 'It is already received.';
  }
  if (target === 'on-site') {
    if (stage === 'on-site') return 'It is already on site.';
    if (stage === 'installed') return 'It is already installed.';
    return WHY[moves.stageBlocked || 'log'];
  }
  if (stage === 'installed') return 'It is already installed.';
  return 'Everything received is already up. Register the rest once the material lands.';
}

export function StageMoveButtons({ moves, stage, supplyOnly, label, onMove }: {
  moves: StageMoves;
  stage: ItemStage;
  /** Supply only → 📍 IS the close and 🔩 is not drawn. */
  supplyOnly: boolean;
  /** Item description, for the `aria-label`s. */
  label: string;
  onMove: (target: MoveTarget) => void;
}) {
  const btn = (target: MoveTarget, text: string, on: boolean, tip: string) => (
    <Button
      size="sm"
      variant="secondary"
      disabled={!on}
      style={{ padding: '4px 9px', font: 'var(--text-caption)' }}
      title={on ? tip : why(moves, stage, target)}
      aria-label={`${STAGE_META[target].label} — ${label || 'Untitled'}`}
      onClick={() => onMove(target)}
    >
      {text}
    </Button>
  );
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      {btn('warehouse', '🏭', moves.toWarehouse, 'It arrived — mark it received into the warehouse')}
      {btn('on-site', supplyOnly ? '📍 On site' : '📍', moves.toSite,
        supplyOnly
          ? 'It reached the jobsite — this package is supply only, so that closes the item out'
          : 'Released to the jobsite. It stays open until it is installed.')}
      {!supplyOnly && btn('installed', '🔩 Installed', !!moves.installVia,
        moves.installVia === 'install-log'
          ? 'It is up — registers every unit still pending as one entry in its installation log'
          : 'It is up — closes this item out')}
    </span>
  );
}
