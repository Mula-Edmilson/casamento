'use strict';

/**
 * Gift catalogue routing modes.
 *
 * Safety contract:
 * - legacy is the default for every existing invitation;
 * - mongo only activates through explicit config.giftCatalogMode = 'mongo';
 * - quantity_contributions keeps precedence because it is an existing,
 *   specialised production flow.
 */
const GIFT_CATALOG_MODES = Object.freeze({
  LEGACY: 'legacy',
  MONGO: 'mongo',
  QUANTITY_CONTRIBUTIONS: 'quantity_contributions'
});

function cleanMode(value) {
  return String(value || '').trim().toLowerCase();
}

function giftCatalogModeForInvite(invite) {
  const selectionMode = cleanMode(invite?.config?.giftSelectionMode);
  if (selectionMode === GIFT_CATALOG_MODES.QUANTITY_CONTRIBUTIONS) {
    return GIFT_CATALOG_MODES.QUANTITY_CONTRIBUTIONS;
  }

  const configuredMode = cleanMode(invite?.config?.giftCatalogMode);
  if (configuredMode === GIFT_CATALOG_MODES.MONGO) return GIFT_CATALOG_MODES.MONGO;
  if (configuredMode === GIFT_CATALOG_MODES.LEGACY) return GIFT_CATALOG_MODES.LEGACY;

  return GIFT_CATALOG_MODES.LEGACY;
}

function usesMongoGiftCatalog(invite) {
  return giftCatalogModeForInvite(invite) === GIFT_CATALOG_MODES.MONGO;
}

/**
 * Phase 2 policy helpers.
 * Only explicit Mongo-managed catalogues bypass legacy seeding/repair rules.
 * All other modes intentionally retain the exact pre-Phase-2 behaviour.
 */
function shouldSeedLegacyGiftCatalog(invite) {
  return !usesMongoGiftCatalog(invite);
}

function shouldRepairLegacyGiftReservations(invite) {
  return !usesMongoGiftCatalog(invite);
}

function shouldUseLegacyRepeatableGiftRules(invite) {
  return !usesMongoGiftCatalog(invite);
}

module.exports = {
  GIFT_CATALOG_MODES,
  giftCatalogModeForInvite,
  usesMongoGiftCatalog,
  shouldSeedLegacyGiftCatalog,
  shouldRepairLegacyGiftReservations,
  shouldUseLegacyRepeatableGiftRules
};
